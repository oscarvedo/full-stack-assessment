import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { env } from '../config/env.js';
import { User } from '../entities/user.entity.js';
import { Wallet } from '../entities/wallet.entity.js';
import { LedgerMovement } from '../entities/ledger-movement.entity.js';
import { Quote } from '../entities/quote.entity.js';
import { Exchange } from '../entities/exchange.entity.js';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.DB.HOST,
  port: env.DB.PORT,
  username: env.DB.USERNAME,
  password: env.DB.PASSWORD,
  database: env.DB.DATABASE,
  synchronize: false,
  logging: false,
  entities: [User, Wallet, LedgerMovement, Quote, Exchange],
  extra: {
    options: '-c timezone=utc'
  }
});
