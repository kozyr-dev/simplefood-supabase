import { DataSource, type DataSourceOptions } from 'typeorm';
import databaseConfig from '@/config/database.config';

/*
 * Checks the migrations themselves, against the Testcontainers Postgres:
 *  - they all apply to an empty database,
 *  - afterwards the schema matches the entities (what `typeorm migration:generate --check` checks),
 *  - every `down()` works: revert everything, then apply again.
 *
 * Runs in its own database, so reverting can't disturb the other e2e files,
 * which Jest runs in parallel against the main test database.
 */
const DATABASE = 'migrations_check';

const options = (database: string) =>
  ({ ...databaseConfig(), database, logging: false }) as DataSourceOptions;

async function connect(database: string): Promise<DataSource> {
  return new DataSource(options(database)).initialize();
}

describe('Migrations (e2e)', () => {
  let admin: DataSource;
  let dataSource: DataSource;

  beforeAll(async () => {
    admin = await connect(process.env.DB_NAME as string);
    await admin.query(`DROP DATABASE IF EXISTS ${DATABASE}`);
    await admin.query(`CREATE DATABASE ${DATABASE}`);
    dataSource = await connect(DATABASE);
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await admin?.query(`DROP DATABASE IF EXISTS ${DATABASE}`);
    await admin?.destroy();
  });

  const applied = async () =>
    (await dataSource.query('SELECT name FROM migrations ORDER BY id')) as {
      name: string;
    }[];

  it('finds the migration files', () => {
    expect(dataSource.migrations.length).toBeGreaterThan(0);
  });

  it('applies every migration to an empty database', async () => {
    const ran = await dataSource.runMigrations({ transaction: 'each' });

    expect(ran.map((migration) => migration.name)).toEqual(
      dataSource.migrations.map((migration) => migration.name),
    );
    expect(await dataSource.showMigrations()).toBe(false); // nothing pending
  });

  it('leaves the schema in sync with the entities', async () => {
    // What `typeorm migration:generate --check` compares: a non-empty list
    // means an entity changed without a migration.
    const { upQueries } = await dataSource.driver.createSchemaBuilder().log();

    expect(upQueries.map((query) => query.query)).toEqual([]);
  });

  it('matches every identity column to its entity: ALWAYS or BY DEFAULT', async () => {
    // The comparison above skips this (TypeORM 1.1 compares only whether a
    // column is generated), so a changed entity would get no migration.
    const expected = dataSource.entityMetadatas
      .flatMap(({ tableName, columns }) =>
        columns
          // Typed without 'identity', but that's the runtime value.
          .filter(
            (column) => (column.generationStrategy as string) === 'identity',
          )
          .map((column) => ({
            table: tableName,
            column: column.databaseName,
            generation: column.generatedIdentity ?? 'BY DEFAULT',
          })),
      )
      .sort((a, b) =>
        `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`),
      );
    const actual = (await dataSource.query(`
      SELECT table_name AS "table", column_name AS "column",
             identity_generation AS "generation"
      FROM information_schema.columns
      WHERE table_schema = 'public' AND is_identity = 'YES'
      ORDER BY table_name, column_name
    `)) as unknown[];

    expect(expected.length).toBeGreaterThan(0); // customer_order.number
    expect(actual).toEqual(expected);
  });

  it('reverts every migration with its down()', async () => {
    for (let i = dataSource.migrations.length; i > 0; i--) {
      await dataSource.undoLastMigration({ transaction: 'each' });
    }

    expect(await applied()).toEqual([]);
    // EnableCitext's down() removed the extension again.
    const extensions = (await dataSource.query(
      `SELECT extname FROM pg_extension WHERE extname = 'citext'`,
    )) as unknown[];
    expect(extensions).toHaveLength(0);
  });

  it('applies everything again after a full revert', async () => {
    await dataSource.runMigrations({ transaction: 'each' });

    expect((await applied()).length).toBe(dataSource.migrations.length);
  });

  describe('UserNameNotUnique (names repeat)', () => {
    const MIGRATION = 'UserNameNotUnique1794853284240';
    const addUser = (name: string, email: string) =>
      dataSource.query(
        `INSERT INTO app_user (name, email, password_hash) VALUES ($1, $2, 'x')`,
        [name, email],
      );

    beforeEach(async () => {
      await dataSource.query('DELETE FROM app_user');
    });

    it('is the newest migration (the tests below undo only the last one)', async () => {
      expect((await applied()).at(-1)?.name).toBe(MIGRATION);
    });

    it('keeps the names through down() and up()', async () => {
      await addUser('Олена Коваль', 'olena@example.com');

      await dataSource.undoLastMigration({ transaction: 'each' });
      expect(await dataSource.query('SELECT username FROM app_user')).toEqual([
        { username: 'Олена Коваль' },
      ]);

      await dataSource.runMigrations({ transaction: 'each' });
      expect(await dataSource.query('SELECT name FROM app_user')).toEqual([
        { name: 'Олена Коваль' },
      ]);
    });

    it("refuses down() once a name is shared or has an '@', changing nothing", async () => {
      await addUser('Олена', 'first@example.com');
      await addUser('олена', 'second@example.com');
      await addUser('Ivan @ home', 'third@example.com');

      await expect(
        dataSource.undoLastMigration({ transaction: 'each' }),
      ).rejects.toThrow(
        "Can't restore unique usernames: 1 name(s) shared by several accounts, " +
          '1 longer than 50 characters or with "@".',
      );

      expect((await applied()).at(-1)?.name).toBe(MIGRATION);
      expect(
        await dataSource.query('SELECT count(*)::int AS n FROM app_user'),
      ).toEqual([{ n: 3 }]);
    });
  });
});
