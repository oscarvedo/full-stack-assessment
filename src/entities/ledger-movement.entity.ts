import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import type { Wallet } from './wallet.entity.js';
import { MovementType } from '../enums/movement-type.enum.js';

@Entity('ledger_movements')
export class LedgerMovement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'wallet_id', type: 'uuid' })
  walletId!: string;

  @ManyToOne('Wallet', (wallet: Wallet) => wallet.movements, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'wallet_id' })
  wallet!: Wallet;

  @Column({
    type: 'enum',
    enum: MovementType,
  })
  type!: MovementType;

  @Column({
    type: 'decimal',
    precision: 24,
    scale: 8,
  })
  amount!: string;

  @Column({
    name: 'previous_balance',
    type: 'decimal',
    precision: 24,
    scale: 8,
  })
  previousBalance!: string;

  @Column({
    name: 'post_balance',
    type: 'decimal',
    precision: 24,
    scale: 8,
  })
  postBalance!: string;

  @Column({ name: 'operation_reference', type: 'varchar' })
  operationReference!: string;

  @Column({ type: 'varchar', length: 32, default: 'COMPLETED' })
  status!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
