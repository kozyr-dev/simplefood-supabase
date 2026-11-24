import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import databaseConfig from '@/config/database.config';
import validationSchema from '@/config/env.validation';
import { TypeOrmLogger } from './typeorm-logger';

/**
 * Entry point for the TypeORM CLI only (migration:generate/run/revert/show).
 * The Nest app never imports this file; it gets the same options via
 * `databaseConfig.asProvider()` in AppModule.
 *
 * Real environment variables win over `.env` (dotenv never overrides them),
 * and a missing `.env` (e.g. in production) is silently ignored.
 */
config({ quiet: true });

// Same schema as ConfigModule, so the CLI and the app can never disagree.
const { error, value } = validationSchema.validate(process.env, {
  allowUnknown: true,
  abortEarly: false,
});

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

// Mirror ConfigModule: expose validated values, including Joi defaults
// (e.g. DB_PORT=5432), to the config factory without overriding real env vars.
for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
  if (!(key in process.env)) {
    process.env[key] = String(val);
  }
}

const dataSource: DataSource = new DataSource({
  ...databaseConfig(),
  // Each CLI command sets the levels it prints (`migration:show` lists the
  // migrations at `schema`, `migration:run` echoes each `query`); read them
  // from the data source, not fixed at construction.
  logger: new TypeOrmLogger(() => dataSource.options.logging),
});

export default dataSource;
