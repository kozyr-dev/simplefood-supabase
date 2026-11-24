import { INestApplication } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import {
  DiscoveryModule,
  DiscoveryService,
  MetadataScanner,
} from '@nestjs/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, IsNull } from 'typeorm';
import { RefreshToken } from '@/auth/entities/refresh-token.entity';
import { User, UserRole } from '@/users/entities/user.entity';
import { adminApi, dataOf, errorOf, rowsOf } from './utils/admin';
import { bearer, loginAs } from './utils/auth';
import { resetDatabase } from './utils/database';
import { createUser } from './utils/factories';
import { mailbox } from './utils/mail';
import { createTestApp } from './utils/test-app';
import { resetRateLimits } from './utils/throttler';

const ID = '01a1559c-a1ed-7641-ac0e-64612b99bb5a';
const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch'];

describe('Admin API: users and access (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let owner: User;
  let admin: ReturnType<typeof adminApi>;

  beforeAll(async () => {
    app = await createTestApp({ imports: [DiscoveryModule] });
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await mailbox(app).then((box) => box.clear());
    await resetDatabase(dataSource);
    resetRateLimits(app);
    owner = await createUser(dataSource, { role: UserRole.Admin });
    admin = adminApi(app, (await loginAs(app, owner)).accessToken);
  });

  afterAll(async () => {
    await app.close();
  });

  const activeSessions = (userId: string) =>
    dataSource
      .getRepository(RefreshToken)
      .countBy({ user: { id: userId }, revokedAt: IsNull() });

  it('lists accounts without their password hash; searches and filters', async () => {
    await createUser(dataSource, {
      name: 'Олена',
      email: 'olena@example.com',
    });
    await createUser(dataSource, { role: UserRole.Editor, blocked: true });

    const all = await admin.get('users').expect(200);
    expect(all.text).not.toMatch(/password|\$2[ab]\$/i);
    expect(rowsOf(all)).toHaveLength(3);
    expect(rowsOf(await admin.get('users?q=olena').expect(200))).toHaveLength(
      1,
    );
    expect(
      rowsOf(await admin.get('users?role=editor&blocked=true').expect(200)),
    ).toHaveLength(1);
  });

  it('makes a customer an editor, ending their sessions', async () => {
    const customer = await createUser(dataSource);
    await loginAs(app, customer);

    const res = await admin
      .patch(`users/${customer.id}`, { role: 'editor' })
      .expect(200);

    expect(dataOf(res)).toMatchObject({ role: 'editor', blocked: false });
    expect(await activeSessions(customer.id)).toBe(0);
  });

  it('blocks an editor: sessions end, login is refused; unblocking lets them back', async () => {
    const editor = await createUser(dataSource, { role: UserRole.Editor });
    await loginAs(app, editor);

    await admin.patch(`users/${editor.id}`, { blocked: true }).expect(200);

    expect(await activeSessions(editor.id)).toBe(0);
    const login = () =>
      request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: editor.email, password: 'correct horse battery' });
    await login().expect(403);
    await admin.patch(`users/${editor.id}`, { blocked: false }).expect(200);
    await login().expect(200);
  });

  it('refuses changes to your own account: 400 OWN_ACCOUNT', async () => {
    const res = await admin
      .patch(`users/${owner.id}`, { role: 'editor' })
      .expect(400);

    expect(errorOf(res).code).toBe('OWN_ACCOUNT');
  });

  it('lets an admin demote or block another while one active admin stays', async () => {
    const other = await createUser(dataSource, { role: UserRole.Admin });

    await admin.patch(`users/${other.id}`, { role: 'editor' }).expect(200);
    await admin
      .patch(`users/${other.id}`, { role: 'admin', blocked: true })
      .expect(200);
  });

  it('never removes the last active admin: 409 LAST_ADMIN, nothing changes', async () => {
    // `other` was an admin; its access token still says so (up to 15 min).
    const other = await createUser(dataSource, { role: UserRole.Admin });
    const asOther = adminApi(app, (await loginAs(app, other)).accessToken);
    await admin.patch(`users/${other.id}`, { role: 'editor' }).expect(200);

    for (const change of [
      { blocked: true },
      { role: 'editor' },
      { role: 'customer' },
    ]) {
      const res = await asOther.patch(`users/${owner.id}`, change).expect(409);
      expect(errorOf(res).code).toBe('LAST_ADMIN');
    }
    expect(
      await dataSource.getRepository(User).findOneByOrFail({ id: owner.id }),
    ).toMatchObject({
      role: UserRole.Admin,
      blocked: false,
    });
  });

  it('two admins demoting each other at once: one wins, the other gets 409', async () => {
    const other = await createUser(dataSource, { role: UserRole.Admin });
    const asOther = adminApi(app, (await loginAs(app, other)).accessToken);

    const results = await Promise.all([
      admin.patch(`users/${other.id}`, { role: 'editor' }),
      asOther.patch(`users/${owner.id}`, { role: 'editor' }),
    ]);

    expect(results.map((res) => res.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    expect(
      await dataSource
        .getRepository(User)
        .countBy({ role: UserRole.Admin, blocked: false }),
    ).toBe(1);
  });

  it('sends a password-reset link', async () => {
    const customer = await createUser(dataSource, {
      email: 'olena@example.com',
    });

    await admin.post(`users/${customer.id}/password-reset`).expect(204);

    const { sent } = await mailbox(app);
    expect(sent.map((mail) => mail.to)).toEqual(['olena@example.com']);
  });

  it('is for admins only: editors get 403', async () => {
    const editor = await createUser(dataSource, { role: UserRole.Editor });
    const asEditor = adminApi(app, (await loginAs(app, editor)).accessToken);

    await asEditor.get('users').expect(403);
    await asEditor.patch(`users/${editor.id}`, { role: 'admin' }).expect(403);
  });

  it("refuses unknown fields: personal data stays the owner's", async () => {
    const customer = await createUser(dataSource);

    await admin
      .patch(`users/${customer.id}`, { email: 'x@example.com' })
      .expect(400);
    await admin
      .patch(`users/${customer.id}`, { passwordHash: 'x' })
      .expect(400);
  });

  describe('every admin route', () => {
    /** Each route of the admin API, as `[method, path]` with `:id` filled in. */
    function adminRoutes(): [string, string][] {
      const scanner = new MetadataScanner();
      return app
        .get(DiscoveryService)
        .getControllers()
        .flatMap(({ metatype }) => {
          const base = Reflect.getMetadata(
            PATH_METADATA,
            metatype as object,
          ) as string;
          if (!base?.startsWith('admin/') || base === 'admin/auth') return [];
          const prototype = (metatype as { prototype: Record<string, object> })
            .prototype;
          return scanner
            .getAllMethodNames(prototype)
            .filter((name) =>
              Reflect.hasMetadata(PATH_METADATA, prototype[name]),
            )
            .map((name): [string, string] => {
              const method =
                HTTP_METHODS[
                  Reflect.getMetadata(
                    METHOD_METADATA,
                    prototype[name],
                  ) as number
                ];
              const path = Reflect.getMetadata(
                PATH_METADATA,
                prototype[name],
              ) as string;
              const full = [base, path].filter((p) => p && p !== '/').join('/');
              return [method, `/api/${full.replace(/:id/g, ID)}`];
            });
        });
    }

    it('needs a login (401) and a staff role (403 for customers)', async () => {
      const routes = adminRoutes();
      expect(routes.length).toBeGreaterThan(40);
      const customer = (await loginAs(app, await createUser(dataSource)))
        .accessToken;

      for (const [method, path] of routes) {
        const call = () =>
          (
            request(app.getHttpServer()) as unknown as Record<
              string,
              (p: string) => request.Test
            >
          )[method](path);
        expect([method, path, (await call()).status]).toEqual([
          method,
          path,
          401,
        ]);
        expect([
          method,
          path,
          (await call().set(bearer(customer))).status,
        ]).toEqual([method, path, 403]);
      }
    });

    it('is never cached', async () => {
      for (const path of [
        'products',
        'orders',
        'users',
        'dashboard',
        'settings',
      ]) {
        const res = await admin.get(path).expect(200);
        expect([path, res.headers['cache-control']]).toEqual([
          path,
          'no-store',
        ]);
      }
    });
  });
});
