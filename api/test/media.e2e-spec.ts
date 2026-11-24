import type { DataSource, Repository } from 'typeorm';
import { Media } from '@/media/entities/media.entity';
import { openTestDataSource, resetDatabase } from './utils/database';
import { createMedia } from './utils/factories';

/*
 * The Media table against real Postgres: what AppBaseEntity generates (UUIDv7
 * ids, timestamps), the jsonb column, and the database-level constraints.
 */
const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('Media entity (e2e)', () => {
  let dataSource: DataSource;
  let media: Repository<Media>;

  beforeAll(async () => {
    dataSource = await openTestDataSource();
    media = dataSource.getRepository(Media);
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  describe('AppBaseEntity columns', () => {
    it('gets a UUIDv7 id from Postgres, readable right after save', async () => {
      const saved = await createMedia(dataSource);

      expect(saved.id).toMatch(UUID_V7);
    });

    it('generates ids that sort by creation time', async () => {
      const first = await createMedia(dataSource);
      const second = await createMedia(dataSource);

      expect(first.id < second.id).toBe(true);
    });

    it('sets createdAt and updatedAt, and bumps updatedAt on update', async () => {
      const saved = await createMedia(dataSource);
      expect(saved.createdAt).toBeInstanceOf(Date);
      expect(saved.updatedAt.getTime()).toBe(saved.createdAt.getTime());

      await new Promise((resolve) => setTimeout(resolve, 10));
      saved.alt = 'changed';
      const updated = await media.save(saved);

      expect(updated.updatedAt.getTime()).toBeGreaterThan(
        saved.createdAt.getTime(),
      );
    });
  });

  it('stores and returns formats as an object (jsonb)', async () => {
    const formats = {
      thumbnail: { url: '/uploads/thumbnail_a.jpg', width: 156, height: 104 },
      small: { url: '/uploads/small_a.jpg', width: 500, height: 333 },
    };
    const saved = await createMedia(dataSource, { formats });

    const loaded = await media.findOneByOrFail({ id: saved.id });
    expect(loaded.formats).toEqual(formats);
  });

  it('allows files without dimensions (non-images)', async () => {
    const saved = await createMedia(dataSource, {
      mime: 'application/pdf',
      width: null,
      height: null,
    });

    expect(await media.findOneByOrFail({ id: saved.id })).toMatchObject({
      width: null,
      height: null,
      formats: null,
    });
  });

  it.each([
    ['CHK_media_size_non_negative', { size: -1 }],
    ['CHK_media_width_positive', { width: 0 }],
    ['CHK_media_height_positive', { height: -5 }],
  ])('rejects invalid data in the database (%s)', async (constraint, bad) => {
    await expect(createMedia(dataSource, bad)).rejects.toThrow(constraint);
  });
});
