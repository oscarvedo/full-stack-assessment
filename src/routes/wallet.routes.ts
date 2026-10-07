import { Router } from 'express';
import {
  authenticateUserMiddleware,
  requireRoleMiddleware,
} from '../middlewares/auth.middleware.js';
import { walletController } from '../controllers/wallet.controller.js';
import { UserRole } from '../enums/role.enum.js';

const router = Router();

// Get user wallets with balances
router.get(
  '/',
  authenticateUserMiddleware,
  requireRoleMiddleware([UserRole.USUARIO]),
  walletController.getWallets
);

// Get ledger movement history for a user wallet
router.get(
  '/:id/movements',
  authenticateUserMiddleware,
  requireRoleMiddleware([UserRole.USUARIO]),
  walletController.getWalletMovements
);

export default router;
