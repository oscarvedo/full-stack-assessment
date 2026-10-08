import { Request, Response, NextFunction } from 'express';
import { complianceService } from '../services/compliance.service.js';

export class ComplianceController {
  // Query all exchanges pending compliance review
  getPendingExchanges = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const pendingExchanges = await complianceService.getPendingExchanges();
      res.status(200).json(pendingExchanges);
    } catch (error) {
      next(error);
    }
  };

  // Approve a retained exchange
  approveExchange = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = req.params.id as string;
      const complianceUserId = req.user!.id;
      const { notes } = req.body || {};

      const approved = await complianceService.approveExchange(
        id,
        complianceUserId,
        notes
      );
      res.status(200).json(approved);
    } catch (error) {
      next(error);
    }
  };

  // Reject a retained exchange
  rejectExchange = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = req.params.id as string;
      const complianceUserId = req.user!.id;
      const { notes } = req.body || {};

      const rejected = await complianceService.rejectExchange(
        id,
        complianceUserId,
        notes
      );
      res.status(200).json(rejected);
    } catch (error) {
      next(error);
    }
  };
}

export const complianceController = new ComplianceController();
