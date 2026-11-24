import { join } from 'node:path';
import type { PostgresDataSourceOptions } from 'typeorm/driver/postgres/PostgresDataSourceOptions';
import { SnakeNamingStrategy } from '@/database/snake-naming.strategy';
import databaseConfig from './database.config';

const DB_ENV = {
  DB_HOST: 'db.internal',
  DB_PORT: '6543',
  DB_USER: 'app',
  DB_PASSWORD: 'secret',
  DB_NAME: 'simplefood',
};

/** Runs the config factory with the given env, then restores the env. */
function buildWith(env: Record<string, string>): PostgresDataSourceOptions {
  const saved = Object.fromEntries(
    Object.keys(env).map((key) => [key, process.env[key]]),
  );
  try {
    Object.assign(process.env, env);
    return databaseConfig() as PostgresDataSourceOptions;
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('database config', () => {
  const options = buildWith(DB_ENV);

  it('connects to Postgres with the DB_* variables', () => {
    expect(options).toMatchObject({
      type: 'postgres',
      host: 'db.internal',
      username: 'app',
      password: 'secret',
      database: 'simplefood',
      applicationName: 'simplefood-api',
    });
  });

  it('turns DB_PORT into a number', () => {
    expect(options.port).toBe(6543);
  });

  it('never changes the schema on its own', () => {
    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
  });

  it('uses snake_case names', () => {
    expect(options.namingStrategy).toBeInstanceOf(SnakeNamingStrategy);
  });

  // Under Jest this file is the .ts source, so the globs must pick .ts files
  // (from dist/ they pick .js: that's what lets the e2e tests run migrations).
  it("loads entities and migrations with this file's own extension", () => {
    const src = join(__dirname, '..');

    expect(options.entities).toEqual([join(src, '**', '*.entity.ts')]);
    expect(options.migrations).toEqual([
      join(src, 'database', 'migrations', '*.ts'),
    ]);
  });
});
