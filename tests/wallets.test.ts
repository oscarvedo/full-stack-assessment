import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BigNumber from 'bignumber.js';
import { app } from '../src/app.js';
import { AppDataSource } from '../src/database/data-source.js';
import { runSeed } from '../src/database/seeds/initial-data.js';
import { Wallet } from '../src/entities/wallet.entity.js';

describe('Wallets Endpoints (GET /wallets & GET /wallets/:id/movements)', () => {
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

  describe('GET /wallets', () => {
    it('should return 401 Unauthorized if X-User-Id header is missing', async () => {
      const res = await request(app).get('/wallets');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('should return 401 Unauthorized if user does not exist', async () => {
      const res = await request(app)
        .get('/wallets')
        .set('X-User-Id', 'non-existent-user');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('should return 403 Forbidden if user does not have Usuario role', async () => {
      const res = await request(app)
        .get('/wallets')
        .set('X-User-Id', 'compliance-001');
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
    });

    it('should return 200 OK with wallets and computed totalBalance for valid user', async () => {
      const res = await request(app)
        .get('/wallets')
        .set('X-User-Id', 'user-001');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);

      const usdtWallet = res.body.find((w: any) => w.asset === 'USDT-SBX');
      const xautWallet = res.body.find((w: any) => w.asset === 'XAUT-SBX');

      expect(usdtWallet).toBeDefined();
      expect(usdtWallet.availableBalance).toBeDefined();
      expect(usdtWallet.heldBalance).toBeDefined();
      expect(usdtWallet.totalBalance).toBeDefined();

      // Verify mathematical balance formula: totalBalance = availableBalance + heldBalance
      const expectedTotal = new BigNumber(usdtWallet.availableBalance)
        .plus(usdtWallet.heldBalance)
        .toFixed(8);
      expect(usdtWallet.totalBalance).toBe(expectedTotal);

      expect(xautWallet).toBeDefined();
      expect(xautWallet.availableBalance).toBeDefined();
      expect(xautWallet.heldBalance).toBeDefined();
      expect(xautWallet.totalBalance).toBeDefined();
    });
  });

  describe('GET /wallets/:id/movements', () => {
    it('should return 401 Unauthorized if X-User-Id header is missing', async () => {
      const res = await request(app).get('/wallets/123e4567-e89b-12d3-a456-426614174000/movements');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('should return 404 Not Found if wallet ID is not a valid UUID', async () => {
      const res = await request(app)
        .get('/wallets/not-a-valid-uuid/movements')
        .set('X-User-Id', 'user-001');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Wallet not found' });
    });

    it('should return 404 Not Found if wallet does not exist', async () => {
      const res = await request(app)
        .get('/wallets/00000000-0000-0000-0000-000000000000/movements')
        .set('X-User-Id', 'user-001');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Wallet not found' });
    });

    it('should return 404 Not Found if wallet belongs to another user (tenant isolation)', async () => {
      const walletRepo = AppDataSource.getRepository(Wallet);
      const complianceWallet = await walletRepo.findOne({
        where: { userId: 'compliance-001' },
      });

      expect(complianceWallet).toBeDefined();

      const res = await request(app)
        .get(`/wallets/${complianceWallet!.id}/movements`)
        .set('X-User-Id', 'user-001');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Wallet not found' });
    });

    it('should return 200 OK with movement history and audit fields for owned wallet', async () => {
      // 1. Get user-001's USDT wallet ID
      const walletsRes = await request(app)
        .get('/wallets')
        .set('X-User-Id', 'user-001');

      const usdtWallet = walletsRes.body.find((w: any) => w.asset === 'USDT-SBX');

      // 2. Query movements
      const movementsRes = await request(app)
        .get(`/wallets/${usdtWallet.id}/movements`)
        .set('X-User-Id', 'user-001');

      expect(movementsRes.status).toBe(200);
      expect(Array.isArray(movementsRes.body)).toBe(true);
      expect(movementsRes.body.length).toBeGreaterThanOrEqual(1);

      const movement = movementsRes.body[0];
      expect(movement).toHaveProperty('id');
      expect(movement).toHaveProperty('type');
      expect(movement).toHaveProperty('amount');
      expect(movement).toHaveProperty('previousBalance');
      expect(movement).toHaveProperty('postBalance');
      expect(movement).toHaveProperty('operationReference');
      expect(movement).toHaveProperty('status');
      expect(movement).toHaveProperty('createdAt');
    });
  });
});
