import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource, type Repository } from 'typeorm';
import { SectionType } from '@/content/entities/page-section.entity';
import { Media } from '@/media/entities/media.entity';
import { MEDIA_STORAGE, type MediaStorage } from '@/media/types/media.types';
import { UserRole } from '@/users/entities/user.entity';
import { bearer, loginAs } from './utils/auth';
import { resetDatabase } from './utils/database';
import {
  createMedia,
  createPage,
  createProduct,
  createUser,
} from './utils/factories';
import {
  emptyUploads,
  storedFiles,
  testImage,
  uploadsDir,
} from './utils/images';
import { createTestApp } from './utils/test-app';
import { resetRateLimits } from './utils/throttler';

/** A stored file name: 22 base64url characters, plus a size prefix for copies. */
const FILE =
  /^\/uploads\/(?:(?:large|medium|small|thumbnail)_)?[\w-]{22}\.(jpg|png|webp)$/;

interface MediaBody {
  id: string;
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  formats: Record<
    string,
    { url: string; width: number; height: number }
  > | null;
}

describe('Media uploads (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let media: Repository<Media>;
  let editorToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    media = dataSource.getRepository(Media);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
    await emptyUploads(app);
    resetRateLimits(app);
    const editor = await createUser(dataSource, { role: UserRole.Editor });
    editorToken = (await loginAs(app, editor)).accessToken;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const http = () => request(app.getHttpServer());

  /** POST /api/media with `file` (unless null) and the given text fields. */
  function upload(
    file: Buffer | null,
    fields: Record<string, string> = {},
    {
      token = editorToken,
      filename = 'photo.jpg',
      contentType = 'image/jpeg',
    } = {},
  ) {
    const req = http().post('/api/media').set(bearer(token));
    for (const [name, value] of Object.entries(fields)) {
      void req.field(name, value);
    }
    if (file) {
      void req.attach('file', file, { filename, contentType });
    }
    return req;
  }

  const dataOf = (res: request.Response) =>
    (res.body as { data: MediaBody }).data;

  function errorOf(res: request.Response) {
    return (res.body as { error: { code: string; message: string } }).error;
  }

  /** Every URL of an uploaded image: the original and its copies. */
  const urlsOf = (body: MediaBody) => [
    body.url,
    ...Object.values(body.formats ?? {}).map((format) => format.url),
  ];

  /** The file behind a /uploads URL, read from disk. */
  const fileOf = (url: string) =>
    readFile(join(uploadsDir(app), url.slice('/uploads/'.length)));

  async function tokenFor(role: UserRole) {
    const user = await createUser(dataSource, { role });
    return (await loginAs(app, user)).accessToken;
  }

  describe('POST /api/media', () => {
    it('stores the image and its smaller sizes, and describes them', async () => {
      const res = await upload(
        await testImage(1600, 1200),
        { alt: 'Борщ зі сметаною', folder: 'products' },
        { filename: 'Борщ на столі.jpg' },
      ).expect(201);

      const body = dataOf(res);
      expect(body).toEqual({
        id: expect.any(String),
        url: expect.stringMatching(FILE),
        alt: 'Борщ зі сметаною',
        width: 1600,
        height: 1200,
        formats: {
          large: { url: expect.stringMatching(FILE), width: 1000, height: 750 },
          medium: { url: expect.stringMatching(FILE), width: 750, height: 563 },
          small: { url: expect.stringMatching(FILE), width: 500, height: 375 },
          thumbnail: {
            url: expect.stringMatching(FILE),
            width: 208,
            height: 156,
          },
        },
      });
      // The copies share the original's random name.
      const base = body.url.slice('/uploads/'.length);
      expect(body.formats?.small.url).toBe(`/uploads/small_${base}`);

      const row = await media.findOneByOrFail({ id: body.id });
      expect(row).toMatchObject({
        name: 'Борщ на столі.jpg',
        mime: 'image/jpeg',
        folder: 'products',
        size: (await fileOf(body.url)).length,
      });
      expect(await storedFiles(app)).toEqual(
        urlsOf(body)
          .map((url) => url.slice('/uploads/'.length))
          .sort(),
      );
    });

    it('stores each size with the dimensions it reports', async () => {
      const body = dataOf(
        await upload(await testImage(1600, 1200)).expect(201),
      );

      const sizes = [
        { url: body.url, width: body.width, height: body.height },
        ...Object.values(body.formats ?? {}),
      ];
      for (const { url, width, height } of sizes) {
        const actual = await sharp(await fileOf(url)).metadata();
        expect([actual.format, actual.width, actual.height]).toEqual([
          'jpeg',
          width,
          height,
        ]);
      }
    });

    it('keeps no metadata: the GPS position of a phone photo is gone', async () => {
      const photo = await sharp(await testImage(800, 600))
        .withExif({
          IFD0: { Make: 'PhoneMaker' },
          IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '50/1 27/1 0/1' },
        })
        .toBuffer();

      const body = dataOf(await upload(photo).expect(201));

      for (const url of urlsOf(body)) {
        const served = (await http().get(url).expect(200)).body as Buffer;
        expect((await sharp(served).metadata()).exif).toBeUndefined();
        expect(served.toString('latin1')).not.toContain('PhoneMaker');
      }
    });

    it('stores a small image without copies', async () => {
      const body = dataOf(await upload(await testImage(200, 100)).expect(201));

      expect(body.formats).toBeNull();
      expect(await storedFiles(app)).toHaveLength(1);
    });

    it('goes by the content, not the name or the claimed type', async () => {
      const res = await upload(
        await testImage(300, 300, 'png'),
        {},
        {
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
        },
      ).expect(201);

      expect(dataOf(res).url).toMatch(/\.png$/);
      expect(await media.findOneByOrFail({ id: dataOf(res).id })).toMatchObject(
        { mime: 'image/png' },
      );
    });

    it('lets admins upload too, and stores an empty alt as none', async () => {
      const res = await upload(
        await testImage(100, 100, 'webp'),
        { alt: '' },
        { token: await tokenFor(UserRole.Admin) },
      ).expect(201);

      expect(dataOf(res)).toMatchObject({ alt: null });
    });

    it('refuses customers (403) and guests (401), storing nothing', async () => {
      const image = await testImage(100, 100);

      const res = await upload(
        image,
        {},
        {
          token: await tokenFor(UserRole.Customer),
        },
      ).expect(403);
      expect(errorOf(res).code).toBe('FORBIDDEN');
      await http()
        .post('/api/media')
        .attach('file', image, 'photo.jpg')
        .expect(401);

      expect(await media.count()).toBe(0);
      expect(await storedFiles(app)).toEqual([]);
    });

    describe('refused uploads leave no row and no file', () => {
      afterEach(async () => {
        expect(await media.count()).toBe(0);
        expect(await storedFiles(app)).toEqual([]);
      });

      it.each([
        [
          'HTML sent as a PNG',
          '<!doctype html><script>alert(1)</script>',
          'page.png',
        ],
        [
          'an SVG',
          '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
          'logo.svg',
        ],
      ])('%s: 415', async (_, content, filename) => {
        const res = await upload(
          Buffer.from(content),
          {},
          {
            filename,
            contentType: 'image/png',
          },
        ).expect(415);

        expect(errorOf(res)).toMatchObject({
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Only JPEG, PNG and WebP images are accepted',
        });
      });

      it('a file over 10 MB: 413', async () => {
        const big = Buffer.concat([
          await testImage(10, 10),
          Buffer.alloc(10 * 1024 * 1024),
        ]);

        const res = await upload(big).expect(413);

        expect(errorOf(res).code).toBe('PAYLOAD_TOO_LARGE');
      });

      it('an image over 40 megapixels: 400', async () => {
        // A tiny PNG that declares 8000 × 6000 pixels.
        const png = await testImage(1, 1, 'png');
        png.writeUInt32BE(8000, 16);
        png.writeUInt32BE(6000, 20);
        const { crc32 } = await import('node:zlib');
        png.writeUInt32BE(crc32(png.subarray(12, 29)), 29);

        const res = await upload(png, {}, { contentType: 'image/png' }).expect(
          400,
        );

        expect(errorOf(res)).toMatchObject({
          code: 'INVALID_IMAGE',
          message: 'The image is larger than 40 megapixels',
        });
      });

      it('a damaged image: 400', async () => {
        const image = await testImage(800, 600);

        const res = await upload(
          image.subarray(0, Math.floor(image.length / 2)),
        ).expect(400);

        expect(errorOf(res).code).toBe('INVALID_IMAGE');
      });

      it('no file: 400', async () => {
        const res = await upload(null, { alt: 'Борщ' }).expect(400);

        expect(errorOf(res).code).toBe('FILE_REQUIRED');
      });

      it('two files, or a file in another field: 400', async () => {
        const image = await testImage(100, 100);

        await upload(image).attach('file', image, 'second.jpg').expect(400);
        await http()
          .post('/api/media')
          .set(bearer(editorToken))
          .attach('image', image, 'photo.jpg')
          .expect(400);
      });

      it.each([
        ['an unknown field', { url: '/uploads/x.jpg' }],
        ['a bad folder', { folder: '../Products' }],
        ['a long alt text', { alt: 'x'.repeat(501) }],
      ])('%s: 400', async (_, fields) => {
        await upload(await testImage(100, 100), fields).expect(400);
      });
    });

    it('removes the files it wrote when storing one fails', async () => {
      const storage = app.get<MediaStorage>(MEDIA_STORAGE);
      const save = storage.save.bind(storage);
      let calls = 0;
      jest.spyOn(storage, 'save').mockImplementation((name, data) => {
        calls++;
        return calls === 3
          ? Promise.reject(new Error('disk full'))
          : save(name, data);
      });

      await upload(await testImage(1600, 1200)).expect(500);

      expect(calls).toBe(3);
      expect(await storedFiles(app)).toEqual([]);
      expect(await media.count()).toBe(0);
    });

    it('removes the files when the row cannot be saved', async () => {
      jest
        .spyOn(app.get<Repository<Media>>(getRepositoryToken(Media)), 'save')
        .mockRejectedValueOnce(new Error('database is down'));

      await upload(await testImage(1600, 1200)).expect(500);

      expect(await storedFiles(app)).toEqual([]);
    });
  });

  describe('GET /uploads/*', () => {
    it('serves every file, cacheable for a year, viewable from the site', async () => {
      const body = dataOf(
        await upload(await testImage(1600, 1200)).expect(201),
      );

      for (const url of urlsOf(body)) {
        const res = await http().get(url).expect(200);

        expect(res.headers).toMatchObject({
          'content-type': 'image/jpeg',
          'cache-control': 'public, max-age=31536000, immutable',
          'cross-origin-resource-policy': 'cross-origin',
          'x-content-type-options': 'nosniff',
        });
        expect(res.body).toEqual(await fileOf(url));
      }
    });

    // Like every path outside /api: Express's plain 404, not the JSON shape.
    it('answers a missing file with 404', async () => {
      await http().get('/uploads/missing.jpg').expect(404);
    });

    it.each([
      ['a path out of the folder', '/uploads/%2e%2e/%2e%2e/package.json'],
      ['an encoded slash', '/uploads/..%2fpackage.json'],
      ['the folder itself', '/uploads/'],
      ['a hidden file', '/uploads/.secret.jpg'],
    ])('never serves %s (404)', async (_, path) => {
      await writeFile(join(uploadsDir(app), '.secret.jpg'), 'hidden');

      await http().get(path).expect(404);
    });
  });

  describe('PATCH /api/media/:id', () => {
    const patch = (id: string, body: object, token = editorToken) =>
      http().patch(`/api/media/${id}`).set(bearer(token)).send(body);

    it('changes the fields sent; null clears one', async () => {
      const image = await createMedia(dataSource, {
        alt: 'old',
        folder: 'blog',
      });

      const res = await patch(image.id, { alt: 'Новий опис' }).expect(200);
      expect(dataOf(res)).toMatchObject({ id: image.id, alt: 'Новий опис' });
      expect(await media.findOneByOrFail({ id: image.id })).toMatchObject({
        alt: 'Новий опис',
        folder: 'blog',
      });

      await patch(image.id, { alt: null, folder: null }).expect(200);
      expect(await media.findOneByOrFail({ id: image.id })).toMatchObject({
        alt: null,
        folder: null,
      });
    });

    it('changes nothing else: url, size and the rest are not fields', async () => {
      const image = await createMedia(dataSource);

      await patch(image.id, { url: '/uploads/other.jpg' }).expect(400);
    });

    it('answers an unknown id with 404 and a malformed one with 400', async () => {
      await patch('019a1b2c-3d4e-7f50-8a6b-7c8d9e0f1a2b', { alt: 'x' }).expect(
        404,
      );
      await patch('not-a-uuid', { alt: 'x' }).expect(400);
    });

    it('refuses customers (403)', async () => {
      const image = await createMedia(dataSource);

      await patch(
        image.id,
        { alt: 'x' },
        await tokenFor(UserRole.Customer),
      ).expect(403);
    });
  });

  describe('DELETE /api/media/:id', () => {
    const remove = (id: string, token = editorToken) =>
      http().delete(`/api/media/${id}`).set(bearer(token));

    it('deletes the row and every file', async () => {
      const body = dataOf(
        await upload(await testImage(1600, 1200)).expect(201),
      );
      const other = dataOf(await upload(await testImage(100, 100)).expect(201));

      const res = await remove(body.id).expect(204);

      expect(res.text).toBe('');
      expect(await media.findOneBy({ id: body.id })).toBeNull();
      // Only the other upload's file is left.
      expect(await storedFiles(app)).toEqual([
        other.url.slice('/uploads/'.length),
      ]);
      await http().get(body.url).expect(404);
    });

    it('leaves products and pages without the image', async () => {
      const body = dataOf(await upload(await testImage(300, 300)).expect(201));
      const image = await media.findOneByOrFail({ id: body.id });
      await createProduct(dataSource, { slug: 'borscht', image });
      await createPage(dataSource, { slug: 'home' }, [
        { type: SectionType.ImageBanner, data: { imageId: image.id } },
      ]);

      await remove(image.id).expect(204);

      const products = await http().get('/api/products').expect(200);
      expect(products.body.data[0]).toMatchObject({
        slug: 'borscht',
        image: null,
      });
      const page = await http().get('/api/pages/home').expect(200);
      expect(page.body.data.sections[0]).toMatchObject({
        type: 'image-banner',
        image: null,
      });
    });

    it('still deletes when a file cannot be removed (it is only logged)', async () => {
      const body = dataOf(await upload(await testImage(300, 300)).expect(201));
      jest
        .spyOn(app.get<MediaStorage>(MEDIA_STORAGE), 'remove')
        .mockRejectedValue(
          Object.assign(new Error('permission denied'), { code: 'EACCES' }),
        );

      await remove(body.id).expect(204);

      expect(await media.count()).toBe(0);
    });

    it('answers an unknown id with 404; refuses customers (403)', async () => {
      const image = await createMedia(dataSource);

      await remove('019a1b2c-3d4e-7f50-8a6b-7c8d9e0f1a2b').expect(404);
      await remove(image.id, await tokenFor(UserRole.Customer)).expect(403);
      expect(await media.count()).toBe(1);
    });
  });
});
