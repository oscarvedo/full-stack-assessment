import { AppDataSource } from '../data-source.js';
import { User } from '../../entities/user.entity.js';
import { Wallet } from '../../entities/wallet.entity.js';
import { LedgerMovement } from '../../entities/ledger-movement.entity.js';
import { UserRole } from '../../enums/role.enum.js';
import { AssetType } from '../../enums/asset.enum.js';
import { MovementType } from '../../enums/movement-type.enum.js';

export async function runSeed(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const userRepository = queryRunner.manager.getRepository(User);
    const walletRepository = queryRunner.manager.getRepository(Wallet);
    const ledgerRepository = queryRunner.manager.getRepository(LedgerMovement);

    // 1. user-001 (Rol: Usuario)
    let user1 = await userRepository.findOne({ where: { id: 'user-001' } });
    if (!user1) {
      user1 = userRepository.create({ id: 'user-001', role: UserRole.USUARIO });
      await userRepository.save(user1);
    }

    // 2. compliance-001 (Rol: Cumplimiento)
    let complianceUser = await userRepository.findOne({
      where: { id: 'compliance-001' }
    });
    if (!complianceUser) {
      complianceUser = userRepository.create({
        id: 'compliance-001',
        role: UserRole.CUMPLIMIENTO
      });
      await userRepository.save(complianceUser);
    }

    // 3. Wallets for user-001: 10,000 USDT-SBX available, 0 XAUT-SBX
    let usdtWallet = await walletRepository.findOne({
      where: { userId: 'user-001', asset: AssetType.USDT_SBX }
    });

    if (!usdtWallet) {
      usdtWallet = walletRepository.create({
        userId: 'user-001',
        asset: AssetType.USDT_SBX,
        availableBalance: '10000.00000000',
        heldBalance: '0.00000000'
      });
      usdtWallet = await walletRepository.save(usdtWallet);

      // Ledger movement for initial credit (mandatory per Section 3.4)
      const initialMovement = ledgerRepository.create({
        walletId: usdtWallet.id,
        type: MovementType.CREDIT,
        amount: '10000.00000000',
        previousBalance: '0.00000000',
        postBalance: '10000.00000000',
        operationReference: 'INITIAL_SEED',
        status: 'COMPLETED'
      });
      await ledgerRepository.save(initialMovement);
    }

    let xautWallet = await walletRepository.findOne({
      where: { userId: 'user-001', asset: AssetType.XAUT_SBX }
    });
    if (!xautWallet) {
      xautWallet = walletRepository.create({
        userId: 'user-001',
        asset: AssetType.XAUT_SBX,
        availableBalance: '0.00000000',
        heldBalance: '0.00000000'
      });
      await walletRepository.save(xautWallet);
    }

    // 4. Wallets for compliance-001: 0 USDT-SBX, 0 XAUT-SBX
    for (const asset of [AssetType.USDT_SBX, AssetType.XAUT_SBX]) {
      const existing = await walletRepository.findOne({
        where: { userId: 'compliance-001', asset }
      });
      if (!existing) {
        const wallet = walletRepository.create({
          userId: 'compliance-001',
          asset,
          availableBalance: '0.00000000',
          heldBalance: '0.00000000'
        });
        await walletRepository.save(wallet);
      }
    }

    await queryRunner.commitTransaction();
    console.log('Seed completed successfully!');
  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error('Error executing seed:', err);
    throw err;
  } finally {
    await queryRunner.release();
  }
}

// Only auto-run when invoked via CLI (not imported during tests)
if (!process.env.VITEST) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal seed error:', err);
      process.exit(1);
    });
}
