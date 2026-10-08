import BigNumber from 'bignumber.js';
import { validate as isValidUuid } from 'uuid';
import { QueryRunner } from 'typeorm';
import { AppDataSource } from '../database/data-source.js';
import { Exchange } from '../entities/exchange.entity.js';
import { Wallet } from '../entities/wallet.entity.js';
import { LedgerMovement } from '../entities/ledger-movement.entity.js';
import { Quote } from '../entities/quote.entity.js';
import { User } from '../entities/user.entity.js';
import { AssetType } from '../enums/asset.enum.js';
import { ExchangeStatus } from '../enums/exchange-status.enum.js';
import { MovementType } from '../enums/movement-type.enum.js';
import { QuoteStatus } from '../enums/quote-status.enum.js';
import { RiskTier } from '../enums/risk-tier.enum.js';
import { UserRole } from '../enums/role.enum.js';
import { quoteService } from './quote.service.js';
import { complianceService } from './compliance.service.js';
import { ApiError } from '../utils/errors.js';

export interface ExecuteExchangeDto {
  userId: string;
  quoteId: string;
  idempotencyKey: string;
}

export class ExchangeService {
  private exchangeRepositorysitory = AppDataSource.getRepository(Exchange);

  // Execute an asset exchange atomically with idempotency and pessimistic locking
  async executeExchange({
    userId,
    quoteId,
    idempotencyKey,
  }: ExecuteExchangeDto): Promise<Exchange> {
    // 1. Idempotency verification
    const existingExchange = await this.exchangeRepositorysitory.findOne({
      where: { idempotencyKey },
    });

    if (existingExchange) {
      // Same key and same payload: return original result without duplicate movements
      if (
        existingExchange.userId === userId &&
        existingExchange.quoteId === quoteId
      ) {
        return existingExchange;
      }
      // Same key and different payload: 409 Conflict
      throw new ApiError(409, 'Conflict');
    }

    // 2. Validate quote existence, ownership, and active window
    const quote = await quoteService.getValidQuoteForExecution(quoteId, userId);

    // 3. Screen transaction through compliance monitoring service
    const compliance = await complianceService.evaluateTransaction(quote.fromAmount);

    // 4. Atomic database transaction with pessimistic row-level locking
    let queryRunner: QueryRunner | null = null;
    try {
      queryRunner = AppDataSource.createQueryRunner();
      await queryRunner.connect();
    } catch (error) {
      throw new ApiError(503, 'Database connection failed');
    }

    try {
      await queryRunner.startTransaction();

      const walletRepository = queryRunner.manager.getRepository(Wallet);
      const ledgerRepository = queryRunner.manager.getRepository(LedgerMovement);
      const exchangeRepository = queryRunner.manager.getRepository(Exchange);
      const quoteRepository = queryRunner.manager.getRepository(Quote);

      // Lock user's USDT wallet row (Pessimistic Locking to prevent double spending)
      const usdtWallet = await walletRepository
        .createQueryBuilder('w')
        .setLock('pessimistic_write')
        .where('w.user_id = :userId AND w.asset = :asset', {
          userId,
          asset: AssetType.USDT_SBX,
        })
        .getOne();

      if (!usdtWallet) {
        throw new ApiError(404, 'USDT wallet not found');
      }

      const availableUsdt = new BigNumber(usdtWallet.availableBalance);
      const fromAmount = new BigNumber(quote.fromAmount);

      // Validate sufficient available balance
      if (availableUsdt.lt(fromAmount)) {
        throw new ApiError(400, 'Insufficient balance');
      }

      // Lock user's XAUT wallet row
      const xautWallet = await walletRepository
        .createQueryBuilder('w')
        .setLock('pessimistic_write')
        .where('w.user_id = :userId AND w.asset = :asset', {
          userId,
          asset: AssetType.XAUT_SBX,
        })
        .getOne();

      if (!xautWallet) {
        throw new ApiError(404, 'XAUT wallet not found');
      }

      // Instantiate new Exchange record
      const exchange = exchangeRepository.create({
        idempotencyKey,
        userId,
        quoteId: quote.id,
        fromAmount: quote.fromAmount,
        toAmount: quote.estimatedToAmount,
        fee: quote.fee,
        price: quote.price,
        riskTier: compliance.riskTier,
        requiresFollowUp: compliance.requiresFollowUp,
      });

      // Save initial exchange to acquire unique ID for ledger operationReference
      const savedExchange = await exchangeRepository.save(exchange);

      // Branch execution by Risk Tier
      if (compliance.riskTier === RiskTier.HIGH) {
        // HIGH: Move funds from available to held balance, status PENDING_REVIEW
        const prevUsdt = new BigNumber(usdtWallet.availableBalance);
        const postUsdt = prevUsdt.minus(fromAmount);
        const prevHeld = new BigNumber(usdtWallet.heldBalance);
        const postHeld = prevHeld.plus(fromAmount);

        usdtWallet.availableBalance = postUsdt.toFixed(8);
        usdtWallet.heldBalance = postHeld.toFixed(8);
        await walletRepository.save(usdtWallet);

        // Record USDT hold ledger movement
        const holdMovement = ledgerRepository.create({
          walletId: usdtWallet.id,
          type: MovementType.DEBIT,
          amount: fromAmount.toFixed(8),
          previousBalance: prevUsdt.toFixed(8),
          postBalance: postUsdt.toFixed(8),
          operationReference: savedExchange.id,
          status: 'HELD_PENDING_REVIEW',
        });
        await ledgerRepository.save(holdMovement);

        savedExchange.status = ExchangeStatus.PENDING_REVIEW;
      } else {
        // LOW & MEDIUM: Immediate execution to COMPLETED
        const prevUsdt = new BigNumber(usdtWallet.availableBalance);
        const postUsdt = prevUsdt.minus(fromAmount);

        usdtWallet.availableBalance = postUsdt.toFixed(8);
        await walletRepository.save(usdtWallet);

        // Record USDT debit movement
        const debitMovement = ledgerRepository.create({
          walletId: usdtWallet.id,
          type: MovementType.DEBIT,
          amount: fromAmount.toFixed(8),
          previousBalance: prevUsdt.toFixed(8),
          postBalance: postUsdt.toFixed(8),
          operationReference: savedExchange.id,
          status: 'COMPLETED',
        });
        await ledgerRepository.save(debitMovement);

        // Credit destination XAUT wallet
        const prevXaut = new BigNumber(xautWallet.availableBalance);
        const toAmount = new BigNumber(quote.estimatedToAmount);
        const postXaut = prevXaut.plus(toAmount);

        xautWallet.availableBalance = postXaut.toFixed(8);
        await walletRepository.save(xautWallet);

        // Record XAUT credit movement
        const creditMovement = ledgerRepository.create({
          walletId: xautWallet.id,
          type: MovementType.CREDIT,
          amount: toAmount.toFixed(8),
          previousBalance: prevXaut.toFixed(8),
          postBalance: postXaut.toFixed(8),
          operationReference: savedExchange.id,
          status: 'COMPLETED',
        });
        await ledgerRepository.save(creditMovement);

        savedExchange.status = ExchangeStatus.COMPLETED;
      }

      // Mark quote as USED
      quote.status = QuoteStatus.USED;
      await quoteRepository.save(quote);

      // Persist final exchange state
      const finalExchange = await exchangeRepository.save(savedExchange);

      await queryRunner.commitTransaction();
      return finalExchange;
    } catch (error: any) {
      if (queryRunner?.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      // Handle concurrent race condition on unique idempotency_key
      if (error?.code === '23505' && error?.detail?.includes('idempotency_key')) {
        const replay = await this.exchangeRepositorysitory.findOne({
          where: { idempotencyKey },
        });
        if (replay) {
          if (replay.userId === userId && replay.quoteId === quoteId) {
            return replay;
          }
          throw new ApiError(409, 'Conflict');
        }
      }

      throw error;
    } finally {
      if (queryRunner) {
        await queryRunner.release();
      }
    }
  }

  // Get details and full audit traceability of an exchange
  async getExchangeById(exchangeId: string, currentUser: User): Promise<Exchange> {
    if (!isValidUuid(exchangeId)) {
      throw new ApiError(404, 'Exchange not found');
    }

    const exchange = await this.exchangeRepositorysitory.findOne({
      where: { id: exchangeId },
      relations: { quote: true },
    });

    if (!exchange) {
      throw new ApiError(404, 'Exchange not found');
    }

    // Role Segregation: regular users can only view their own exchanges
    if (
      currentUser.role === UserRole.USUARIO &&
      exchange.userId !== currentUser.id
    ) {
      throw new ApiError(403, 'Forbidden');
    }

    return exchange;
  }
}

export const exchangeService = new ExchangeService();
