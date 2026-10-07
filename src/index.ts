import 'reflect-metadata';
import { app } from './app.js';
import { env } from './config/env.js';
import { AppDataSource } from './database/data-source.js';

async function bootstrap() {
  try {
    console.log('Connecting to database...');
    await AppDataSource.initialize();
    console.log('Database connected successfully.');

    app.listen(env.PORT, () => {
      console.log(`Digital Assets Exchange API running on port ${env.PORT}`);
    });
  } catch (error) {
    console.error('Fatal error during application startup:', error);
    process.exit(1);
  }
}

bootstrap();
