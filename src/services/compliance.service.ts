import BigNumber from 'bignumber.js';
import { validate as isValidUuid } from 'uuid';
import { QueryRunner } from 'typeorm';
import { AppDataSource } from '../database/data-source.js';
import { Exchange } from '../entities/exchange.entity.js';
import { Wallet } from '../entities/wallet.entity.js';
import { LedgerMovement } from '../entities/ledger-movement.entity.js';
import { AssetType } from '../enums/asset.enum.js';
import { ExchangeStatus } from '../enums/exchange-status.enum.js';
import { MovementType } from '../enums/movement-type.enum.js';
import { RiskTier } from '../enums/risk-tier.enum.js';
import { APP_CONSTANTS } from '../config/constants.js';
import { ApiError } from '../utils/errors.js';

export interface ComplianceEvaluationResult {
  riskTier: RiskTier;
  requiresFollowUp: boolean;
}

export class ComplianceService {
  private exchangeRepositorysitory = AppDataSource.getRepository(Exchange);

  // Evaluates transactional risk tier based on USDT origin amount
  async evaluateTransaction(amountUsdtStr: string): Promise<ComplianceEvaluationResult> {
    const amount = new BigNumber(amountUsdtStr);

    if (amount.lt(APP_CONSTANTS.COMPLIANCE_THRESHOLDS.LOW_MAX)) {
      return {
        riskTier: RiskTier.LOW,
        requiresFollowUp: false,
      };
    }

    if (amount.lte(APP_CONSTANTS.COMPLIANCE_THRESHOLDS.MEDIUM_MAX)) {
      return {
        riskTier: RiskTier.MEDIUM,
        requiresFollowUp: true,
      };
    }

    return {
      riskTier: RiskTier.HIGH,
      requiresFollowUp: false,
    };
  }

  // Retrieve all exchanges retained for compliance review
  async getPendingExchanges(): Promise<Exchange[]> {
    return this.exchangeRepositorysitory.find({
      where: { status: ExchangeStatus.PENDING_REVIEW },
      order: { createdAt: 'ASC' },
      relations: { quote: true },
    });
  }

  // Approve a pending exchange: debit held balance and credit destination asset
  async approveExchange(
    exchangeId: string,
    complianceUserId: string,
    notes?: string
  ): Promise<Exchange> {
    if (!isValidUuid(exchangeId)) {
      throw new ApiError(404, 'Exchange not found');
    }

    const exchange = await this.exchangeRepositorysitory.findOne({
      where: { id: exchangeId },
    });

    if (!exchange) {
      throw new ApiError(404, 'Exchange not found');
    }

    if (exchange.status !== ExchangeStatus.PENDING_REVIEW) {
      throw new ApiError(400, 'Exchange is not pending review');
    }

    let queryRunner: QueryRunner | null = null;
    try {
      queryRunner = AppDataSource.createQueryRunner();
      await queryRunner.connect();
    } catch {
      throw new ApiError(503, 'Database connection failed');
    }

    try {
      await queryRunner.startTransaction();

      const walletRepository = queryRunner.manager.getRepository(Wallet);
      const ledgerRepository = queryRunner.manager.getRepository(LedgerMovement);
      const exchangeRepository = queryRunner.manager.getRepository(Exchange);

      // Lock user's USDT wallet with pessimistic write lock
      const usdtWallet = await walletRepository
        .createQueryBuilder('w')
        .setLock('pessimistic_write')
        .where('w.user_id = :userId AND w.asset = :asset', {
          userId: exchange.userId,
          asset: AssetType.USDT_SBX,
        })
        .getOne();

      if (!usdtWallet) {
        throw new ApiError(404, 'USDT wallet not found');
      }

      const fromAmount = new BigNumber(exchange.fromAmount);
      const currentHeld = new BigNumber(usdtWallet.heldBalance);

      if (currentHeld.lt(fromAmount)) {
        throw new ApiError(400, 'Insufficient held balance to settle exchange');
      }

      // Deduct held balance
      usdtWallet.heldBalance = currentHeld.minus(fromAmount).toFixed(8);
      await walletRepository.save(usdtWallet);

      // Lock user's destination XAUT wallet
      const xautWallet = await walletRepository
        .createQueryBuilder('w')
        .setLock('pessimistic_write')
        .where('w.user_id = :userId AND w.asset = :asset', {
          userId: exchange.userId,
          asset: AssetType.XAUT_SBX,
        })
        .getOne();

      if (!xautWallet) {
        throw new ApiError(404, 'XAUT wallet not found');
      }

      // Credit destination XAUT wallet
      const prevXaut = new BigNumber(xautWallet.availableBalance);
      const toAmount = new BigNumber(exchange.toAmount);
      const postXaut = prevXaut.plus(toAmount);

      xautWallet.availableBalance = postXaut.toFixed(8);
      await walletRepository.save(xautWallet);

      // Record XAUT credit movement in immutable ledger
      const creditMovement = ledgerRepository.create({
        walletId: xautWallet.id,
        type: MovementType.CREDIT,
        amount: toAmount.toFixed(8),
        previousBalance: prevXaut.toFixed(8),
        postBalance: postXaut.toFixed(8),
        operationReference: exchange.id,
        status: 'COMPLETED',
      });
      await ledgerRepository.save(creditMovement);

      // Finalize exchange record with decision audit trail
      exchange.status = ExchangeStatus.COMPLETED;
      exchange.complianceDecisionById = complianceUserId;
      exchange.complianceDecisionAt = new Date();
      exchange.complianceNotes = notes || null;

      const finalExchange = await exchangeRepository.save(exchange);

      await queryRunner.commitTransaction();
      return finalExchange;
    } catch (error) {
      if (queryRunner?.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      if (queryRunner) {
        await queryRunner.release();
      }
    }
  }

  // Reject a pending exchange: release held balance back to available balance
  async rejectExchange(
    exchangeId: string,
    complianceUserId: string,
    notes?: string
  ): Promise<Exchange> {
    if (!isValidUuid(exchangeId)) {
      throw new ApiError(404, 'Exchange not found');
    }

    const exchange = await this.exchangeRepositorysitory.findOne({
      where: { id: exchangeId },
    });

    if (!exchange) {
      throw new ApiError(404, 'Exchange not found');
    }

    if (exchange.status !== ExchangeStatus.PENDING_REVIEW) {
      throw new ApiError(400, 'Exchange is not pending review');
    }

    let queryRunner: QueryRunner | null = null;
    try {
      queryRunner = AppDataSource.createQueryRunner();
      await queryRunner.connect();
    } catch {
      throw new ApiError(503, 'Database connection failed');
    }

    try {
      await queryRunner.startTransaction();

      const walletRepository = queryRunner.manager.getRepository(Wallet);
      const ledgerRepository = queryRunner.manager.getRepository(LedgerMovement);
      const exchangeRepository = queryRunner.manager.getRepository(Exchange);

      // Lock user's USDT wallet with pessimistic write lock
      const usdtWallet = await walletRepository
        .createQueryBuilder('w')
        .setLock('pessimistic_write')
        .where('w.user_id = :userId AND w.asset = :asset', {
          userId: exchange.userId,
          asset: AssetType.USDT_SBX,
        })
        .getOne();

      if (!usdtWallet) {
        throw new ApiError(404, 'USDT wallet not found');
      }

      const fromAmount = new BigNumber(exchange.fromAmount);
      const currentHeld = new BigNumber(usdtWallet.heldBalance);

      if (currentHeld.lt(fromAmount)) {
        throw new ApiError(400, 'Insufficient held balance to release');
      }

      const prevAvailable = new BigNumber(usdtWallet.availableBalance);
      const postAvailable = prevAvailable.plus(fromAmount);

      usdtWallet.heldBalance = currentHeld.minus(fromAmount).toFixed(8);
      usdtWallet.availableBalance = postAvailable.toFixed(8);
      await walletRepository.save(usdtWallet);

      // Record USDT release ledger movement
      const releaseMovement = ledgerRepository.create({
        walletId: usdtWallet.id,
        type: MovementType.CREDIT,
        amount: fromAmount.toFixed(8),
        previousBalance: prevAvailable.toFixed(8),
        postBalance: postAvailable.toFixed(8),
        operationReference: exchange.id,
        status: 'COMPLETED',
      });
      await ledgerRepository.save(releaseMovement);

      // Finalize exchange record as REJECTED with decision audit trail
      exchange.status = ExchangeStatus.REJECTED;
      exchange.complianceDecisionById = complianceUserId;
      exchange.complianceDecisionAt = new Date();
      exchange.complianceNotes = notes || null;

      const finalExchange = await exchangeRepository.save(exchange);

      await queryRunner.commitTransaction();
      return finalExchange;
    } catch (error) {
      if (queryRunner?.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      if (queryRunner) {
        await queryRunner.release();
      }
    }
  }
}

export const complianceService = new ComplianceService();
