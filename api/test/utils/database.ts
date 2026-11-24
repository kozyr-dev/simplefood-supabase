import { DataSource, type DataSourceOptions } from 'typeorm';
import databaseConfig from '@/config/database.config';

/**
 * A DataSource on this worker's test database, for tests that work with
 * repositories directly instead of through HTTP. Tests that boot the app can
 * use `app.get(DataSource)` instead. Remember `await dataSource.destroy()`.
 */
export function openTestDataSource(): Promise<DataSource> {
  return new DataSource({
    ...databaseConfig(),
    logging: false,
  } as DataSourceOptions).initialize();
}

/**
 * Empties every entity table (including many-to-many join tables) in this
 * worker's database, keeping the schema and the migrations table. Call it in
 * `beforeEach` in test files that write data.
 */
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  const escape = (name: string) => dataSource.driver.escape(name);
  const tables = dataSource.entityMetadatas
    .filter((metadata) => metadata.tableType !== 'view')
    .map(({ schema, tableName }) =>
      (schema ? [schema, tableName] : [tableName]).map(escape).join('.'),
    );

  if (tables.length) {
    await dataSource.query(
      `TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`,
    );
  }
}

/**
 * Resolves once some query in this database waits for a row lock: for race
 * tests that hold a row in one transaction while another request reaches it.
 */
export async function waitForLockWait(dataSource: DataSource): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [{ waiting }] = await dataSource.query<{ waiting: number }[]>(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if (waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('No query started waiting for a lock within 5 s');
}
