import { Request, Response, NextFunction } from 'express';
import { walletService } from '../services/wallet.service.js';

export class WalletController {
  // Get user wallets with balances
  getWallets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const wallets = await walletService.getUserWallets(userId);
      res.status(200).json(wallets);
    } catch (error) {
      next(error);
    }
  };

  // Get ledger movement history for a wallet
  getWalletMovements = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = req.params.id as string;
      const userId = req.user!.id;
      const movements = await walletService.getWalletMovements(id, userId);
      res.status(200).json(movements);
    } catch (error) {
      next(error);
    }
  };
}

export const walletController = new WalletController();
