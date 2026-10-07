import { Router } from 'express';
import {
  authenticateUserMiddleware,
  requireRoleMiddleware
} from '../middlewares/auth.middleware.js';
import { quoteController } from '../controllers/quote.controller.js';
import { UserRole } from '../enums/role.enum.js';

const router = Router();

// Generate a guaranteed commercial quote valid for 30 seconds
router.post(
  '/',
  authenticateUserMiddleware,
  requireRoleMiddleware([UserRole.USUARIO]),
  quoteController.createQuote
);

export default router;
