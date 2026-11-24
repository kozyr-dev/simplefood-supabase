import { extname, join } from 'node:path';
import { registerAs } from '@nestjs/config';
import { DataSourceOptions, type LogLevel } from 'typeorm';
import { SnakeNamingStrategy } from '@/database/snake-naming.strategy';
import { TypeOrmLogger } from '@/database/typeorm-logger';

/** Failed queries, warnings and migrations. The CLI sets its own per command. */
const LOG_LEVELS: LogLevel[] = ['error', 'warn', 'migration'];

/**
 * Database config under the `database` namespace: the single source of truth
 * for the Nest app (`databaseConfig.asProvider()`) and the TypeORM CLI
 * (`database/data-source.ts`).
 *
 * Reading `process.env` here is safe: ConfigModule validates it with the Joi
 * schema (config/env.validation.ts) and fills in defaults before any
 * `registerAs` factory runs. data-source.ts does the same for the CLI.
 *
 * Globs use the extension of this very file: the app and the CLI load the
 * compiled `.js` files from `dist/`, and the e2e tests (Jest, running from
 * `src/`) load the `.ts` sources, so they run the real migrations too.
 */
const ext = extname(__filename); // '.js' or '.ts'

export default registerAs('database', (): DataSourceOptions => ({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  applicationName: 'simplefood-api',
  namingStrategy: new SnakeNamingStrategy(),

  entities: [join(__dirname, '..', '**', `*.entity${ext}`)],

  // Schema changes only via reviewed migrations, never auto-sync.
  synchronize: false,

  // Through Nest's logger (pino), never with query parameters.
  logging: LOG_LEVELS,
  logger: new TypeOrmLogger(LOG_LEVELS),

  migrationsTableName: 'migrations',
  // Migrations run as an explicit deploy step (`npm run migration:run`), not on boot.
  migrationsRun: false,
  migrations: [join(__dirname, '..', 'database', 'migrations', `*${ext}`)],
}));
