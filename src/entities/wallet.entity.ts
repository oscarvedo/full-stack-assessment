import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Unique,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import BigNumber from 'bignumber.js';
import { User } from './user.entity.js';
import { AssetType } from '../enums/asset.enum.js';
import type { LedgerMovement } from './ledger-movement.entity.js';

@Entity('wallets')
@Unique(['userId', 'asset'])
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'varchar' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.wallets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({
    type: 'enum',
    enum: AssetType,
  })
  asset!: AssetType;

  // Stored as decimal(24, 8) to avoid IEEE-754 binary floating point issues
  @Column({
    name: 'available_balance',
    type: 'decimal',
    precision: 24,
    scale: 8,
    default: '0.00000000',
  })
  availableBalance!: string;

  @Column({
    name: 'held_balance',
    type: 'decimal',
    precision: 24,
    scale: 8,
    default: '0.00000000',
  })
  heldBalance!: string;

  // Computed Total Balance = AvailableBalance + heldBalance
  get totalBalance(): string {
    const available = new BigNumber(this.availableBalance || '0');
    const held = new BigNumber(this.heldBalance || '0');
    return available.plus(held).toFixed(8);
  }

  @OneToMany('LedgerMovement', (movement: LedgerMovement) => movement.wallet)
  movements!: LedgerMovement[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
