import { Request, Response, NextFunction } from 'express';
import { quoteService } from '../services/quote.service.js';
import { ApiError } from '../utils/errors.js';

export class QuoteController {
  // Generate a guaranteed commercial quote valid for 30 seconds
  createQuote = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { fromAmount } = req.body;

      if (!fromAmount) {
        throw new ApiError(400, 'Missing required field: fromAmount');
      }

      const userId = req.user!.id;
      const quote = await quoteService.createQuote({ userId, fromAmount });

      res.status(201).json(quote);
    } catch (error) {
      next(error);
    }
  };
}

export const quoteController = new QuoteController();
