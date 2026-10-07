import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn
} from 'typeorm';
import { User } from './user.entity.js';
import { AssetType } from '../enums/asset.enum.js';
import { QuoteStatus } from '../enums/quote-status.enum.js';

@Entity('quotes')
export class Quote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'varchar' })
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({
    name: 'from_asset',
    type: 'enum',
    enum: AssetType,
    default: AssetType.USDT_SBX
  })
  fromAsset!: AssetType;

  @Column({
    name: 'to_asset',
    type: 'enum',
    enum: AssetType,
    default: AssetType.XAUT_SBX
  })
  toAsset!: AssetType;

  @Column({
    name: 'from_amount',
    type: 'decimal',
    precision: 24,
    scale: 8
  })
  fromAmount!: string;

  @Column({
    type: 'decimal',
    precision: 24,
    scale: 8,
    default: '2500.00000000'
  })
  price!: string;

  @Column({
    type: 'decimal',
    precision: 24,
    scale: 8
  })
  fee!: string;

  @Column({
    name: 'estimated_to_amount',
    type: 'decimal',
    precision: 24,
    scale: 8
  })
  estimatedToAmount!: string;

  @Column({
    type: 'enum',
    enum: QuoteStatus,
    default: QuoteStatus.ACTIVE
  })
  status!: QuoteStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;
}
