import BigNumber from 'bignumber.js';
import { AppDataSource } from '../database/data-source.js';
import { Quote } from '../entities/quote.entity.js';
import { AssetType } from '../enums/asset.enum.js';
import { QuoteStatus } from '../enums/quote-status.enum.js';
import { APP_CONSTANTS } from '../config/constants.js';
import { ApiError } from '../utils/errors.js';

export interface CreateQuoteDto {
  userId: string;
  fromAmount: string;
}

export interface QuoteResponseDto {
  id: string;
  userId: string;
  fromAsset: string;
  toAsset: string;
  fromAmount: string;
  price: string;
  fee: string;
  estimatedToAmount: string;
  status: string;
  createdAt: Date;
  expiresAt: Date;
}

export class QuoteService {
  private quoteRepository = AppDataSource.getRepository(Quote);

  // Generate a guaranteed commercial quote valid for 30 seconds
  async createQuote({ userId, fromAmount }: CreateQuoteDto): Promise<QuoteResponseDto> {
    let amount: BigNumber;
    try {
      amount = new BigNumber(fromAmount);
    } catch {
      throw new ApiError(400, 'Invalid amount: fromAmount must be a positive number');
    }

    // Validate positive numeric amount
    if (amount.isNaN() || amount.lte(0)) {
      throw new ApiError(400, 'Invalid amount: fromAmount must be a positive number');
    }

    // Deduct 1% fee on origin asset (USDT-SBX)
    const fee = amount
      .multipliedBy(APP_CONSTANTS.COMMISSION_RATE)
      .decimalPlaces(APP_CONSTANTS.DECIMAL_PLACES, BigNumber.ROUND_DOWN);

    // Net amount after fee
    const netAmount = amount.minus(fee);

    // Calculate XAUT-SBX amount: netAmount / 2500, rounded down to 8 decimals
    const estimatedToAmount = netAmount
      .dividedBy(APP_CONSTANTS.XAUT_PRICE_USDT)
      .decimalPlaces(APP_CONSTANTS.DECIMAL_PLACES, BigNumber.ROUND_DOWN);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + APP_CONSTANTS.QUOTE_TTL_SECONDS * 1000);

    const quote = this.quoteRepository.create({
      userId,
      fromAsset: AssetType.USDT_SBX,
      toAsset: AssetType.XAUT_SBX,
      fromAmount: amount.toFixed(APP_CONSTANTS.DECIMAL_PLACES),
      price: APP_CONSTANTS.XAUT_PRICE_USDT.toFixed(APP_CONSTANTS.DECIMAL_PLACES),
      fee: fee.toFixed(APP_CONSTANTS.DECIMAL_PLACES),
      estimatedToAmount: estimatedToAmount.toFixed(APP_CONSTANTS.DECIMAL_PLACES),
      status: QuoteStatus.ACTIVE,
      createdAt: now,
      expiresAt,
    });

    const savedQuote = await this.quoteRepository.save(quote);

    return {
      id: savedQuote.id,
      userId: savedQuote.userId,
      fromAsset: savedQuote.fromAsset,
      toAsset: savedQuote.toAsset,
      fromAmount: savedQuote.fromAmount,
      price: savedQuote.price,
      fee: savedQuote.fee,
      estimatedToAmount: savedQuote.estimatedToAmount,
      status: savedQuote.status,
      createdAt: savedQuote.createdAt,
      expiresAt: savedQuote.expiresAt,
    };
  }

  // Validate quote existence, ownership, and active state (lazy expiration evaluation)
  async getValidQuoteForExecution(quoteId: string, userId: string): Promise<Quote> {
    const quote = await this.quoteRepository.findOne({
      where: { id: quoteId, userId },
    });

    if (!quote) {
      throw new ApiError(404, 'Quote not found');
    }

    // Single-use enforcement
    if (quote.status === QuoteStatus.USED) {
      throw new ApiError(400, 'Quote has already been used');
    }

    // Lazy expiration evaluation: check if TTL window expired
    const now = new Date();
    if (quote.status === QuoteStatus.EXPIRED || now.getTime() > quote.expiresAt.getTime()) {
      if (quote.status !== QuoteStatus.EXPIRED) {
        quote.status = QuoteStatus.EXPIRED;
        await this.quoteRepository.save(quote);
      }
      throw new ApiError(400, 'Quote has expired');
    }

    return quote;
  }
}

export const quoteService = new QuoteService();
