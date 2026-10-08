import { Router } from 'express';
import {
  authenticateUserMiddleware,
  requireRoleMiddleware,
} from '../middlewares/auth.middleware.js';
import { exchangeController } from '../controllers/exchange.controller.js';
import { UserRole } from '../enums/role.enum.js';

const router = Router();

// Execute an asset exchange
router.post(
  '/',
  authenticateUserMiddleware,
  requireRoleMiddleware([UserRole.USUARIO]),
  exchangeController.createExchange
);

// Get operation details and audit traceability
router.get(
  '/:id',
  authenticateUserMiddleware,
  exchangeController.getExchangeById
);

export default router;
