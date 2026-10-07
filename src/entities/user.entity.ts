import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { UserRole } from '../enums/role.enum.js';
import type { Wallet } from './wallet.entity.js';

@Entity('users')
export class User {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USUARIO,
  })
  role!: UserRole;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  // Relations (using type-only import and string relation to avoid ESM circular dependency)
  @OneToMany('Wallet', (wallet: Wallet) => wallet.user)
  wallets!: Wallet[];
}
