import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/test-app';

/** The app built with ADMIN_DIST_DIR set to `dir`; every other value real. */
function appServing(dir: string): Promise<INestApplication<App>> {
  return createTestApp({
    beforeConfigure: (app) => {
      const config = app.get(ConfigService);
      const realGetOrThrow = config.getOrThrow.bind(config);
      jest
        .spyOn(config, 'getOrThrow')
        .mockImplementation((key: string) =>
          key === 'ADMIN_DIST_DIR' ? dir : realGetOrThrow(key),
        );
    },
  });
}

describe('The admin app at /admin (e2e)', () => {
  let dist: string;

  beforeAll(async () => {
    dist = await mkdtemp(join(tmpdir(), 'admin-dist-'));
    await mkdir(join(dist, 'assets'));
    await writeFile(
      join(dist, 'index.html'),
      '<!doctype html><script type="module" src="/admin/assets/index-abc123.js"></script>',
    );
    await writeFile(join(dist, 'assets', 'index-abc123.js'), 'console.log(1)');
    await writeFile(join(dist, '.env'), 'SECRET=1');
  });

  afterAll(async () => {
    await rm(dist, { recursive: true, force: true });
  });

  describe('when built', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await appServing(dist);
    });

    afterAll(async () => {
      jest.restoreAllMocks();
      await app.close();
    });

    const http = () => request(app.getHttpServer());

    it('serves index.html at /admin/, revalidated on every load, with the strict CSP', async () => {
      const res = await http().get('/admin/').expect(200);

      expect(res.text).toContain('index-abc123.js');
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.headers['content-security-policy']).toContain(
        "script-src 'self'",
      );
      // No inline scripts allowed: the app needs none (unlike AdminJS).
      expect(res.headers['content-security-policy']).not.toMatch(
        /script-src[^;]*unsafe-inline/,
      );
    });

    it('redirects /admin to /admin/ (the app needs the slash)', async () => {
      const res = await http().get('/admin').expect(301);

      expect(res.headers.location).toBe('/admin/');
    });

    it('serves the hashed assets as immutable for a year', async () => {
      const res = await http().get('/admin/assets/index-abc123.js').expect(200);

      expect(res.headers['cache-control']).toBe(
        'public, max-age=31536000, immutable',
      );
    });

    it('never serves hidden files', async () => {
      await http().get('/admin/.env').expect(404);
    });

    it('leaves /api/admin to the API', async () => {
      await http().get('/api/admin/products').expect(401);
    });
  });

  it('is not served when there is no build', async () => {
    const app = await appServing(join(dist, 'missing'));
    try {
      await request(app.getHttpServer()).get('/admin/').expect(404);
    } finally {
      jest.restoreAllMocks();
      await app.close();
    }
  });
});
