import type { DataSource } from 'typeorm';
import { Media } from '@/media/entities/media.entity';
import { openTestDataSource, resetDatabase } from './utils/database';
import { createMedia } from './utils/factories';

/*
 * The e2e test infrastructure itself: per-worker databases (global-setup.ts +
 * worker-database.ts) and resetDatabase(). If these break, every other suite
 * starts failing randomly, so they get their own tests.
 */
describe('Test database isolation (e2e)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await openTestDataSource();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  const currentDatabase = async () =>
    (
      (await dataSource.query('SELECT current_database() AS name')) as {
        name: string;
      }[]
    )[0].name;

  it("uses this worker's own copy, never the shared template", async () => {
    const template = process.env.TEST_DB_TEMPLATE;
    const worker = process.env.JEST_WORKER_ID ?? '1';

    expect(await currentDatabase()).toBe(`${template}_w${worker}`);
    expect(await currentDatabase()).not.toBe(template);
  });

  it('starts with every migration applied (copied from the template)', async () => {
    const applied = (await dataSource.query(
      'SELECT name FROM migrations',
    )) as unknown[];

    expect(applied).toHaveLength(dataSource.migrations.length);
    expect(await dataSource.showMigrations()).toBe(false); // nothing pending
  });

  it('resetDatabase() empties entity tables but keeps the migrations', async () => {
    await createMedia(dataSource);
    await createMedia(dataSource);
    expect(await dataSource.getRepository(Media).count()).toBe(2);

    await resetDatabase(dataSource);

    expect(await dataSource.getRepository(Media).count()).toBe(0);
    expect(await dataSource.showMigrations()).toBe(false);
  });
});
