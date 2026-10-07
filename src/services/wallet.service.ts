import { AppDataSource } from '../database/data-source.js';
import { Wallet } from '../entities/wallet.entity.js';
import { LedgerMovement } from '../entities/ledger-movement.entity.js';
import { ApiError } from '../utils/errors.js';

export interface WalletResponseDto {
  id: string;
  asset: string;
  availableBalance: string;
  heldBalance: string;
  totalBalance: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LedgerMovementResponseDto {
  id: string;
  walletId: string;
  type: string;
  amount: string;
  previousBalance: string;
  postBalance: string;
  operationReference: string;
  status: string;
  createdAt: Date;
}

export class WalletService {
  private walletRepository = AppDataSource.getRepository(Wallet);
  private ledgerRepository = AppDataSource.getRepository(LedgerMovement);

  // Retrieve user wallets with balances
  async getUserWallets(userId: string): Promise<WalletResponseDto[]> {
    const wallets = await this.walletRepository.find({
      where: { userId },
      order: { asset: 'ASC' },
    });

    return wallets.map((w) => ({
      id: w.id,
      asset: w.asset,
      availableBalance: w.availableBalance,
      heldBalance: w.heldBalance,
      totalBalance: w.totalBalance,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    }));
  }

  // Retrieve immutable movement history for a user wallet
  async getWalletMovements(
    walletId: string,
    userId: string
  ): Promise<LedgerMovementResponseDto[]> {
    // Verify wallet existence and ownership
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId, userId },
    });

    if (!wallet) {
      throw new ApiError(404, 'Wallet not found');
    }

    const movements = await this.ledgerRepository.find({
      where: { walletId },
      order: { createdAt: 'DESC' },
    });

    return movements.map((m) => ({
      id: m.id,
      walletId: m.walletId,
      type: m.type,
      amount: m.amount,
      previousBalance: m.previousBalance,
      postBalance: m.postBalance,
      operationReference: m.operationReference,
      status: m.status,
      createdAt: m.createdAt,
    }));
  }
}

export const walletService = new WalletService();
