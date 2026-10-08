import { Request, Response, NextFunction } from 'express';
import { exchangeService } from '../services/exchange.service.js';
import { ApiError } from '../utils/errors.js';

export class ExchangeController {
  // Execute an asset exchange
  createExchange = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const idempotencyKey = req.header('Idempotency-Key');

      if (!idempotencyKey) {
        throw new ApiError(400, 'Missing required header: Idempotency-Key');
      }

      const { quoteId } = req.body;

      if (!quoteId) {
        throw new ApiError(400, 'Missing required field: quoteId');
      }

      const userId = req.user!.id;
      const exchange = await exchangeService.executeExchange({
        userId,
        quoteId,
        idempotencyKey
      });

      res.status(201).json(exchange);
    } catch (error) {
      next(error);
    }
  };

  // Get exchange details and audit trace by id
  getExchangeById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = req.params.id as string;
      const exchange = await exchangeService.getExchangeById(id, req.user!);
      res.status(200).json(exchange);
    } catch (error) {
      next(error);
    }
  };
}

export const exchangeController = new ExchangeController();
