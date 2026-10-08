import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { app } from '../src/app.js';
import { AppDataSource } from '../src/database/data-source.js';
import { runSeed } from '../src/database/seeds/initial-data.js';
import { Quote } from '../src/entities/quote.entity.js';
import { Exchange } from '../src/entities/exchange.entity.js';

describe('Exchanges Endpoints', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

  beforeEach(async () => {
    await runSeed();
  });

  describe('POST /exchanges - Mandatory Scenarios', () => {
    it('should return 401 Unauthorized if X-User-Id is missing', async () => {
      const res = await request(app)
        .post('/exchanges')
        .set('Idempotency-Key', uuidv4())
        .send({ quoteId: '123e4567-e89b-12d3-a456-426614174000' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('should return 400 Bad Request if Idempotency-Key header is missing', async () => {
      const res = await request(app)
        .post('/exchanges')
        .set('X-User-Id', 'user-001')
        .send({ quoteId: '123e4567-e89b-12d3-a456-426614174000' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 Bad Request if quoteId is missing', async () => {
      const res = await request(app)
        .post('/exchanges')
        .set('X-User-Id', 'user-001')
        .set('Idempotency-Key', uuidv4())
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    // Scenario a: Intercambio exitoso con riesgo LOW
    it('should successfully execute LOW risk exchange automatically (amount < 1000 USDT)', async () => {
      const quoteRes = await request(app)
        .post('/quotes')
        .set('X-User-Id', 'user-001')
        .send({ fromAmount: '500' });

      expect(quoteRes.status).toBe(201);
      const quoteId = quoteRes.body.id;

      const exchangeRes = await request(app)
        .post('/exchanges')
        .set('X-User-Id', 'user-001')
        .set('Idempotency-Key', uuidv4())
        .send({ quoteId });

      expect(exchangeRes.status).toBe(201);
      expect(exchangeRes.body.status).toBe('COMPLETED');
      expect(exchangeRes.body.riskTier).toBe('LOW');
      expect(exchangeRes.body.requiresFollowUp).toBe(false);
      expect(exchangeRes.body.fromAmount).toBe('500.00000000');
    });

    // Scenario b: Operacion MEDIUM completada y marcada para seguimiento
    it('should execute MEDIUM risk exchange automatically and mark for follow-up (1000 - 5000 USDT)', async () => {
      const quoteRes = await request(app)
        .post('/quotes')
        .set('X-User-Id', 'user-001')
        .send({ fromAmount: '2500' });

      expect(quoteRes.status).toBe(201);
      const quoteId = quoteRes.body.id;

      const exchangeRes = await request(app)
        .post('/exchanges')
        .set('X-User-Id', 'user-001')
        .set('Idempotency-Key', uuidv4())
        .send({ quoteId });

      expect(exchangeRes.status).toBe(201);
      expect(exchangeRes.body.status).toBe('COMPLETED');
      expect(exchangeRes.body.riskTier).toBe('MEDIUM');
      expect(exchangeRes.body.requiresFollowUp).toBe(true);
    });

    // Scenario c: Saldo insuficiente
    it('should reject exchange with 400 Bad Request if balance is insufficient', async () => {
      // Seed user has 10,000 USDT. Requesting quote for 50,000 USDT:
      const quoteRes = await request(app)
        .post('/quotes')
        .set('X-User-Id', 'user-001')
        .send({ fromAmount: '50000' });

      expect(quoteRes.status).toBe(201);
      const quoteId = quoteRes.body.id;

      const exchangeRes = await request(app)
        .post('/exchanges')
        .set('X-User-Id', 'user-001')
        .set('Idempotency-Key', uuidv4())
        .send({ quoteId });

      expect(exchangeRes.status).toBe(400);
      expect(exchangeRes.body).toEqual({ error: 'Insufficient balance' });
    });

    // Scenario d: Cotizacion vencida
    it('should reject execution with 400 Bad Request if quote is expired', async () => {
      const quoteRes = await request(app)
        .post('/quotes')
        .set('X-User-Id', 'user-001')
        .send({ fromAmount: '500' });

      expect(quoteRes.status).toBe(201);
      const quoteId = quoteRes.body.id;

      // Manually simulate TTL expiration in the past
      const quoteRepo = AppDataSource.getRepository(Quote);
      await quoteRepo.update(quoteId, {
        expiresAt: new Date(Date.now() - 5000),
      });

      const exchangeRes = await request(app)
        .post('/exchanges')
        .set('X-User-Id', 'user-001')
        .set('Idempotency-Key', uuidv4())
        .send({ quoteId });

      expect(exchangeRes.status).toBe(400);
      expect(exchangeRes.body).toEqual({ error: 'Quote has expired' });
    });

    // Scenario e: Repeticion de la misma clave de idempotencia
    it('should return original exchange without duplicate movements when repeating same idempotency key and payload', async () => {
      const quoteRes = await request(app)
        .post('/quotes')
        .set('X-User-Id', 'user-001')
        .send({ fromAmount: '500' });

      const quoteId = quoteRes.body.id;
      const idempotencyKey = uuidv4();

      // First execution
      const firstRes = await request(app)
        .post('/exchanges')
        .set('X-User-Id', 'user-001')
        .set('Idempotency-Key', idempotencyKey)
        .send({ quoteId });

      expect(firstRes.status).toBe(201);
      const originalId = firstRes.body.id;

      // Duplicate execution with exact same key and payload
      const secondRes = await request(app)
        .post('/exchanges')
        .set('X-User-Id', 'user-001')
        .set('Idempotency-Key', idempotencyKey)
        .send({ quoteId });

      expect(secondRes.status).toBe(201);
      expect(secondRes.body.id).toBe(originalId);
    });

    // Scenario f: Reutilizacion de una clave de idempotencia con contenido diferente
    it('should return 409 Conflict when reusing same idempotency key with different quote payload', async () => {
      const quote1Res = await request(app)
        .post('/quotes')
        .set('X-User-Id', 'user-001')
        .send({ fromAmount: '500' });

      const quote2Res = await request(app)
        .post('/quotes')
        .set('X-User-Id', 'user-001')
        .send({ fromAmount: '600' });

      const idempotencyKey = uuidv4();

      // First call with quote 1
      await request(app)
        .post('/exchanges')
        .set('X-User-Id', 'user-001')
        .set('Idempotency-Key', idempotencyKey)
        .send({ quoteId: quote1Res.body.id });

      // Second call reusing key with different quote 2
      const conflictRes = await request(app)
        .post('/exchanges')
        .set('X-User-Id', 'user-001')
        .set('Idempotency-Key', idempotencyKey)
        .send({ quoteId: quote2Res.body.id });

      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body).toEqual({ error: 'Conflict' });
    });

    // Scenario g: Operacion HIGH retenida
    it('should hold HIGH risk exchange in PENDING_REVIEW and transfer available balance to held balance (> 5000 USDT)', async () => {
      const quoteRes = await request(app)
        .post('/quotes')
        .set('X-User-Id', 'user-001')
        .send({ fromAmount: '6000' });

      expect(quoteRes.status).toBe(201);
      const quoteId = quoteRes.body.id;

      const exchangeRes = await request(app)
        .post('/exchanges')
        .set('X-User-Id', 'user-001')
        .set('Idempotency-Key', uuidv4())
        .send({ quoteId });

      expect(exchangeRes.status).toBe(201);
      expect(exchangeRes.body.status).toBe('PENDING_REVIEW');
      expect(exchangeRes.body.riskTier).toBe('HIGH');
      expect(exchangeRes.body.requiresFollowUp).toBe(false);

      // Verify wallet balance shifts to held
      const walletsRes = await request(app)
        .get('/wallets')
        .set('X-User-Id', 'user-001');

      const usdt = walletsRes.body.find((w: any) => w.asset === 'USDT-SBX');
      expect(usdt.heldBalance).toBe('6000.00000000');
      expect(usdt.availableBalance).toBe('4000.00000000');
    });
  });

  describe('GET /exchanges/:id', () => {
    it('should return 401 Unauthorized if X-User-Id is missing', async () => {
      const res = await request(app).get('/exchanges/123e4567-e89b-12d3-a456-426614174000');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('should return 404 Not Found for non-existent exchange', async () => {
      const res = await request(app)
        .get('/exchanges/00000000-0000-0000-0000-000000000000')
        .set('X-User-Id', 'user-001');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Exchange not found' });
    });

    it('should return 200 OK with full exchange audit details for owner', async () => {
      const quoteRes = await request(app)
        .post('/quotes')
        .set('X-User-Id', 'user-001')
        .send({ fromAmount: '500' });

      const exchangeRes = await request(app)
        .post('/exchanges')
        .set('X-User-Id', 'user-001')
        .set('Idempotency-Key', uuidv4())
        .send({ quoteId: quoteRes.body.id });

      const detailsRes = await request(app)
        .get(`/exchanges/${exchangeRes.body.id}`)
        .set('X-User-Id', 'user-001');

      expect(detailsRes.status).toBe(200);
      expect(detailsRes.body.id).toBe(exchangeRes.body.id);
      expect(detailsRes.body.fromAmount).toBe('500.00000000');
      expect(detailsRes.body).toHaveProperty('quote');
    });
  });
});
