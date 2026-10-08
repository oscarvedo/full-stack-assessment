import { Router } from 'express';
import { complianceController } from '../controllers/compliance.controller.js';
import {
  authenticateUserMiddleware,
  requireRoleMiddleware,
} from '../middlewares/auth.middleware.js';
import { UserRole } from '../enums/role.enum.js';

const router = Router();

// Enforce authentication and Compliance role on all compliance routes
router.use(authenticateUserMiddleware);
router.use(requireRoleMiddleware([UserRole.CUMPLIMIENTO]));

// Pending review queue
router.get('/exchanges/pending', complianceController.getPendingExchanges);

// Review decision actions
router.patch('/exchanges/:id/approve', complianceController.approveExchange);
router.patch('/exchanges/:id/reject', complianceController.rejectExchange);

export default router;
