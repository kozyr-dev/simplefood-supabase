// Jest loads globalSetup outside its module system, so the `@/*` mapping in
// jest-e2e.config.ts doesn't apply here: resolve it from tsconfig.json instead.
// Must stay the first import.
import 'tsconfig-paths/register';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource, type DataSourceOptions } from 'typeorm';
import databaseConfig from '@/config/database.config';

/** Same major version as docker-compose.yml and production. */
const POSTGRES_IMAGE = 'postgres:18-alpine';

declare global {
  // Shared with global-teardown.ts (both run in Jest's parent process).
  var __POSTGRES__: StartedPostgreSqlContainer | undefined;
}

/**
 * Runs once before all e2e test files:
 *  1. starts a throwaway Postgres and points the app at it,
 *  2. applies the real migrations to a template database,
 *  3. copies it once per Jest worker (`<template>_w1`, `_w2`, ...).
 * worker-database.ts then gives each worker its own copy, so test files that
 * run in parallel never see each other's data.
 *
 * The variables set here are inherited by Jest's worker processes, and real
 * env vars win over `.env` (ConfigModule never overrides them), so the e2e
 * tests are hermetic: same environment locally and in CI, no `.env` needed,
 * and the docker-compose dev database is never touched.
 */
export default async function globalSetup(globalConfig: {
  maxWorkers: number;
}): Promise<void> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  globalThis.__POSTGRES__ = container;
  const template = container.getDatabase();

  Object.assign(process.env, {
    NODE_ENV: 'test',
    DB_HOST: container.getHost(),
    DB_PORT: String(container.getPort()),
    DB_USER: container.getUsername(),
    DB_PASSWORD: container.getPassword(),
    DB_NAME: template,
    // Read by worker-database.ts to pick this worker's copy.
    TEST_DB_TEMPLATE: template,
    // Required by the env schema; a fixed value the CORS tests rely on.
    CORS_ORIGINS: 'http://localhost:3000',
    // Fixed, so tests can sign their own tokens (expired, wrong audience, ...).
    JWT_ACCESS_SECRET: 'e2e-test-secret-e2e-test-secret-e2e',
    // bcrypt's minimum: cost 12 would add ~250 ms to every register and login.
    BCRYPT_ROUNDS: '4',
    // Required by the env schema. createTestApp() swaps the SMTP transport
    // for a fake, so nothing is sent; port 1 has no server, so a test that
    // bypassed the fake would fail at once instead of mailing anyone.
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1',
    MAIL_FROM: 'noreply@example.com',
    MAIL_NOTIFY_TO: 'shop@example.com',
    FRONTEND_URL: 'http://localhost:3000',
    // A fresh folder per run (each worker gets a subfolder, see
    // worker-database.ts); global-teardown.ts removes it.
    TEST_UPLOADS_ROOT: await mkdtemp(join(tmpdir(), 'simplefood-e2e-uploads-')),
  });

  // Same options the app and the CLI use (read from the env set above).
  const options = { ...databaseConfig(), logging: false } as DataSourceOptions;

  const migrator = await new DataSource(options).initialize();
  try {
    await migrator.runMigrations();
  } finally {
    // A template must have no open connections while it's being copied.
    await migrator.destroy();
  }

  // Copy from the maintenance database `postgres`, not from the template.
  const admin = await new DataSource({
    ...options,
    database: 'postgres',
  } as DataSourceOptions).initialize();
  try {
    for (
      let worker = 1;
      worker <= Math.max(1, globalConfig.maxWorkers);
      worker++
    ) {
      // Names come from Testcontainers and a counter, never from user input.
      await admin.query(
        `CREATE DATABASE "${template}_w${worker}" TEMPLATE "${template}"`,
      );
    }
  } finally {
    await admin.destroy();
  }
}
