import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn
} from 'typeorm';
import { User } from './user.entity.js';
import { Quote } from './quote.entity.js';
import { ExchangeStatus } from '../enums/exchange-status.enum.js';
import { RiskTier } from '../enums/risk-tier.enum.js';

@Entity('exchanges')
export class Exchange {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    unique: true
  })
  idempotencyKey!: string;

  @Column({ name: 'user_id', type: 'varchar' })
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  // Quote traceability
  @Column({ name: 'quote_id', type: 'uuid' })
  quoteId!: string;

  @ManyToOne(() => Quote)
  @JoinColumn({ name: 'quote_id' })
  quote!: Quote;

  // Financial snapshot
  @Column({
    name: 'from_amount',
    type: 'decimal',
    precision: 24,
    scale: 8
  })
  fromAmount!: string;

  @Column({
    name: 'to_amount',
    type: 'decimal',
    precision: 24,
    scale: 8
  })
  toAmount!: string;

  @Column({
    type: 'decimal',
    precision: 24,
    scale: 8
  })
  fee!: string;

  @Column({
    type: 'decimal',
    precision: 24,
    scale: 8
  })
  price!: string; // Exchange rate (2500.00000000)

  @Column({
    type: 'enum',
    enum: ExchangeStatus,
    default: ExchangeStatus.CREATED
  })
  status!: ExchangeStatus;

  // Compliance monitoring
  @Column({
    name: 'risk_tier',
    type: 'enum',
    enum: RiskTier
  })
  riskTier!: RiskTier;

  @Column({
    name: 'requires_follow_up',
    type: 'boolean',
    default: false
  })
  requiresFollowUp!: boolean;

  // Compliance decision audit trail
  @Column({
    name: 'compliance_decision_by',
    type: 'varchar',
    nullable: true
  })
  complianceDecisionById?: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'compliance_decision_by' })
  complianceDecisionUser?: User | null;

  @Column({
    name: 'compliance_decision_at',
    type: 'timestamptz',
    nullable: true
  })
  complianceDecisionAt?: Date | null;

  @Column({
    name: 'compliance_notes',
    type: 'text',
    nullable: true
  })
  complianceNotes?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
