import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { app } from '../src/app.js';
import { AppDataSource } from '../src/database/data-source.js';
import { runSeed } from '../src/database/seeds/initial-data.js';

describe('Compliance Endpoints', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    await runSeed();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

  describe('GET /compliance/exchanges/pending', () => {
    it('should return 401 Unauthorized if X-User-Id is missing', async () => {
      const res = await request(app).get('/compliance/exchanges/pending');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('should return 403 Forbidden if requester is not a compliance officer', async () => {
      const res = await request(app)
        .get('/compliance/exchanges/pending')
        .set('X-User-Id', 'user-001');

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
    });

    it('should return 200 OK with list of pending exchanges for compliance officer', async () => {
      const res = await request(app)
        .get('/compliance/exchanges/pending')
        .set('X-User-Id', 'compliance-001');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('PATCH /compliance/exchanges/:id/approve', () => {
    it('should return 401 Unauthorized if X-User-Id is missing', async () => {
      const res = await request(app).patch(
        '/compliance/exchanges/123e4567-e89b-12d3-a456-426614174000/approve'
      );
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('should return 403 Forbidden if user role is not Cumplimiento', async () => {
      const res = await request(app)
        .patch('/compliance/exchanges/123e4567-e89b-12d3-a456-426614174000/approve')
        .set('X-User-Id', 'user-001');

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
    });

    it('should return 404 Not Found for non-existent exchange', async () => {
      const res = await request(app)
        .patch('/compliance/exchanges/00000000-0000-0000-0000-000000000000/approve')
        .set('X-User-Id', 'compliance-001');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Exchange not found' });
    });

    it('should successfully approve a retained HIGH risk exchange and settle assets', async () => {
      // 1. Generate quote for HIGH risk amount (e.g. 5500 USDT)
      const quoteRes = await request(app)
        .post('/quotes')
        .set('X-User-Id', 'user-001')
        .send({ fromAmount: '5500' });
      expect(quoteRes.status).toBe(201);
      const quoteId = quoteRes.body.id;

      // 2. Execute exchange to retain funds
      const exchangeRes = await request(app)
        .post('/exchanges')
        .set('X-User-Id', 'user-001')
        .set('Idempotency-Key', uuidv4())
        .send({ quoteId });
      expect(exchangeRes.status).toBe(201);
      expect(exchangeRes.body.status).toBe('PENDING_REVIEW');
      const exchangeId = exchangeRes.body.id;

      // 3. Approve the retained exchange
      const approveRes = await request(app)
        .patch(`/compliance/exchanges/${exchangeId}/approve`)
        .set('X-User-Id', 'compliance-001')
        .send({ notes: 'Verified documentation and cleared source of funds' });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.status).toBe('COMPLETED');
      expect(approveRes.body.complianceDecisionById).toBe('compliance-001');
      expect(approveRes.body.complianceDecisionAt).toBeDefined();
      expect(approveRes.body.complianceNotes).toBe(
        'Verified documentation and cleared source of funds'
      );

      // 4. Verify user-001 wallet balance updates
      const walletsRes = await request(app)
        .get('/wallets')
        .set('X-User-Id', 'user-001');

      const usdtWallet = walletsRes.body.find((w: any) => w.asset === 'USDT-SBX');
      const xautWallet = walletsRes.body.find((w: any) => w.asset === 'XAUT-SBX');

      // Held USDT must be debited back to 0
      expect(usdtWallet.heldBalance).toBe('0.00000000');
      // Destination XAUT must reflect credited amount
      expect(Number(xautWallet.availableBalance)).toBeGreaterThan(0);
    });
  });

  describe('PATCH /compliance/exchanges/:id/reject', () => {
    it('should return 401 Unauthorized if X-User-Id is missing', async () => {
      const res = await request(app).patch(
        '/compliance/exchanges/123e4567-e89b-12d3-a456-426614174000/reject'
      );
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('should return 403 Forbidden if user role is not Cumplimiento', async () => {
      const res = await request(app)
        .patch('/compliance/exchanges/123e4567-e89b-12d3-a456-426614174000/reject')
        .set('X-User-Id', 'user-001');

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
    });

    it('should return 404 Not Found for non-existent exchange', async () => {
      const res = await request(app)
        .patch('/compliance/exchanges/00000000-0000-0000-0000-000000000000/reject')
        .set('X-User-Id', 'compliance-001');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Exchange not found' });
    });

    it('should successfully reject a retained exchange and release held funds back to available', async () => {
      await runSeed();

      // 1. Check user initial available balance
      const initialWalletsRes = await request(app)
        .get('/wallets')
        .set('X-User-Id', 'user-001');
      const initialUsdt = initialWalletsRes.body.find((w: any) => w.asset === 'USDT-SBX');
      const initialAvailable = initialUsdt.availableBalance;

      // 2. Execute HIGH risk exchange (using > 5000 USDT)
      const highQuoteRes = await request(app)
        .post('/quotes')
        .set('X-User-Id', 'user-001')
        .send({ fromAmount: '5001' });
      const highExchangeRes = await request(app)
        .post('/exchanges')
        .set('X-User-Id', 'user-001')
        .set('Idempotency-Key', uuidv4())
        .send({ quoteId: highQuoteRes.body.id });

      expect(highExchangeRes.status).toBe(201);
      expect(highExchangeRes.body.status).toBe('PENDING_REVIEW');
      const exchangeId = highExchangeRes.body.id;

      // 3. Reject the retained exchange
      const rejectRes = await request(app)
        .patch(`/compliance/exchanges/${exchangeId}/reject`)
        .set('X-User-Id', 'compliance-001')
        .send({ notes: 'Transaction exceeds risk appetite' });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.status).toBe('REJECTED');
      expect(rejectRes.body.complianceDecisionById).toBe('compliance-001');
      expect(rejectRes.body.complianceDecisionAt).toBeDefined();
      expect(rejectRes.body.complianceNotes).toBe('Transaction exceeds risk appetite');

      // 4. Verify user-001 wallet balances
      const finalWalletsRes = await request(app)
        .get('/wallets')
        .set('X-User-Id', 'user-001');

      const finalUsdt = finalWalletsRes.body.find((w: any) => w.asset === 'USDT-SBX');
      // Held balance must be released back to 0
      expect(finalUsdt.heldBalance).toBe('0.00000000');
    });
  });
});
