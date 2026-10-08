import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { ApiError } from './utils/errors.js';
import walletRoutes from './routes/wallet.routes.js';
import quoteRoutes from './routes/quote.routes.js';
import exchangeRoutes from './routes/exchange.routes.js';
import complianceRoutes from './routes/compliance.routes.js';

export const app = express();

app.use(cors());
app.use(express.json());

// Disable express x-powered-by header
app.disable('x-powered-by');

// Health check endpoint for Docker / orchestration
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount domain routes
app.use('/wallets', walletRoutes);
app.use('/quotes', quoteRoutes);
app.use('/exchanges', exchangeRoutes);
app.use('/compliance', complianceRoutes);

// Global error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});
