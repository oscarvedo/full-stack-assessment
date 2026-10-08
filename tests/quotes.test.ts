import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { AppDataSource } from '../src/database/data-source.js';
import { runSeed } from '../src/database/seeds/initial-data.js';

describe('Quotes Endpoints (POST /quotes)', () => {
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

  it('should return 401 Unauthorized if X-User-Id is missing', async () => {
    const res = await request(app)
      .post('/quotes')
      .send({ fromAmount: '2500' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('should return 401 Unauthorized if user does not exist', async () => {
    const res = await request(app)
      .post('/quotes')
      .set('X-User-Id', 'non-existent-user')
      .send({ fromAmount: '2500' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('should return 403 Forbidden if user role is not Usuario', async () => {
    const res = await request(app)
      .post('/quotes')
      .set('X-User-Id', 'compliance-001')
      .send({ fromAmount: '2500' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('should return 400 Bad Request if fromAmount is missing', async () => {
    const res = await request(app)
      .post('/quotes')
      .set('X-User-Id', 'user-001')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('should return 400 Bad Request if fromAmount is non-numeric', async () => {
    const res = await request(app)
      .post('/quotes')
      .set('X-User-Id', 'user-001')
      .send({ fromAmount: 'invalid-amount' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid amount: fromAmount must be a positive number' });
  });

  it('should return 400 Bad Request if fromAmount is zero or negative', async () => {
    const resZero = await request(app)
      .post('/quotes')
      .set('X-User-Id', 'user-001')
      .send({ fromAmount: '0' });

    expect(resZero.status).toBe(400);
    expect(resZero.body).toEqual({ error: 'Invalid amount: fromAmount must be a positive number' });

    const resNegative = await request(app)
      .post('/quotes')
      .set('X-User-Id', 'user-001')
      .send({ fromAmount: '-500' });

    expect(resNegative.status).toBe(400);
    expect(resNegative.body).toEqual({ error: 'Invalid amount: fromAmount must be a positive number' });
  });

  it('should calculate commercial quotation correctly according to Sec 3.6 example', async () => {
    // Document example: 2500 USDT -> fee 25 USDT (1%), net 2475, estimated XAUT 0.99
    const res = await request(app)
      .post('/quotes')
      .set('X-User-Id', 'user-001')
      .send({ fromAmount: '2500' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.fromAsset).toBe('USDT-SBX');
    expect(res.body.toAsset).toBe('XAUT-SBX');
    expect(res.body.fromAmount).toBe('2500.00000000');
    expect(res.body.price).toBe('2500.00000000');
    expect(res.body.fee).toBe('25.00000000');
    expect(res.body.estimatedToAmount).toBe('0.99000000');
    expect(res.body.status).toBe('ACTIVE');

    // Verify 30-second TTL
    const createdAt = new Date(res.body.createdAt).getTime();
    const expiresAt = new Date(res.body.expiresAt).getTime();
    const diffSeconds = Math.round((expiresAt - createdAt) / 1000);
    expect(diffSeconds).toBe(30);
  });

  it('should handle decimal amounts and apply truncation to 8 decimal places correctly', async () => {
    const res = await request(app)
      .post('/quotes')
      .set('X-User-Id', 'user-001')
      .send({ fromAmount: '1234.56789012' });

    expect(res.status).toBe(201);
    expect(res.body.fromAmount).toBe('1234.56789012');
    // fee: 1234.56789012 * 0.01 = 12.3456789012 -> 12.34567890
    expect(res.body.fee).toBe('12.34567890');
    // net: 1234.56789012 - 12.34567890 = 1222.22221122
    // estimated: 1222.22221122 / 2500 = 0.488888884488 -> 0.48888888
    expect(res.body.estimatedToAmount).toBe('0.48888888');
  });
});
