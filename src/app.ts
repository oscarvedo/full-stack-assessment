import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { ApiError } from './utils/errors.js';
import walletRoutes from './routes/wallet.routes.js';

export const app = express();

app.use(cors());
app.use(express.json());

// Health check endpoint for Docker / orchestration
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount domain routes
app.use('/wallets', walletRoutes);

// Global error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});
