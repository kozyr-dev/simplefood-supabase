import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, IsNull, type Repository } from 'typeorm';
import { RefreshToken } from '@/auth/entities/refresh-token.entity';
import { REUSE_GRACE_MS } from '@/auth/services/refresh-tokens.service';
import { hashToken } from '@/common/crypto/tokens';
import { User, UserRole } from '@/users/entities/user.entity';
import {
  adminLoginAs,
  adminRefreshCookie,
  bearer,
  SAME_ORIGIN,
  type AdminRefreshCookie,
} from './utils/auth';
import { resetDatabase } from './utils/database';
import { createUser, TEST_PASSWORD } from './utils/factories';
import { createTestApp } from './utils/test-app';
import { resetRateLimits } from './utils/throttler';

const JWT = /^[\w-]+\.[\w-]+\.[\w-]+$/;
const REFRESH_TOKEN = /^[\w-]{43}$/;
const DAY_S = 24 * 60 * 60;

describe('Admin app sessions (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let tokens: Repository<RefreshToken>;
  let admin: User;
  let editor: User;
  let customer: User;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    tokens = dataSource.getRepository(RefreshToken);
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
    resetRateLimits(app);
    admin = await createUser(dataSource, { role: UserRole.Admin });
    editor = await createUser(dataSource, { role: UserRole.Editor });
    customer = await createUser(dataSource);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  const login = (email: string, password = TEST_PASSWORD) =>
    http()
      .post('/api/admin/auth/login')
      .set(SAME_ORIGIN)
      .send({ email, password });

  const refresh = (cookie?: AdminRefreshCookie) => {
    const req = http().post('/api/admin/auth/refresh').set(SAME_ORIGIN);
    return cookie ? req.set('Cookie', cookie.header) : req;
  };

  const logout = (cookie?: AdminRefreshCookie) => {
    const req = http().post('/api/admin/auth/logout').set(SAME_ORIGIN);
    return cookie ? req.set('Cookie', cookie.header) : req;
  };

  const errorOf = (res: request.Response) =>
    (res.body as { error: { status: number; code: string } }).error;

  /** The cookie a response sets; fails the test if there is none. */
  const cookieOf = (res: request.Response) => {
    const cookie = adminRefreshCookie(res);
    expect(cookie).toBeDefined();
    return cookie as AdminRefreshCookie;
  };

  /** Expects the response to delete the cookie, on the same path. */
  const expectCookieDeleted = (res: request.Response) => {
    const cookie = cookieOf(res);
    expect(cookie.value).toBe('');
    expect(cookie.attributes).toEqual(
      expect.arrayContaining([
        'Path=/api/admin/auth',
        'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        'Max-Age=0',
      ]),
    );
  };

  /** Whether the session the token belongs to has been ended. */
  const sessionEnded = async (token: string) => {
    const stored = await tokens.findOneByOrFail({
      tokenHash: hashToken(token),
    });
    return !(await tokens.existsBy({
      familyId: stored.familyId,
      revokedAt: IsNull(),
    }));
  };

  describe('POST /admin/auth/login', () => {
    it.each([
      ['an admin', () => admin],
      ['an editor', () => editor],
    ])(
      'logs %s in: the access token in the body, the refresh token only in the cookie',
      async (_, staff) => {
        const res = await login(staff().email).expect(200);

        const { data } = res.body as { data: Record<string, unknown> };
        expect(Object.keys(data).sort()).toEqual([
          'accessToken',
          'expiresIn',
          'user',
        ]);
        expect(data).toMatchObject({
          accessToken: expect.stringMatching(JWT),
          expiresIn: 900,
          user: { id: staff().id, role: staff().role },
        });
        expect(res.text).not.toMatch(/refreshToken/);
        expect(res.headers['cache-control']).toBe('no-store');

        const cookie = cookieOf(res);
        expect(cookie.value).toMatch(REFRESH_TOKEN);
        expect(cookie.attributes).toEqual([
          'Path=/api/admin/auth',
          expect.stringMatching(
            /^Expires=\w{3}, \d\d \w{3} \d{4} [\d:]{8} GMT$/,
          ),
          expect.stringMatching(/^Max-Age=\d+$/),
          'HttpOnly',
          // No `Secure` outside production: local development is plain http.
          'SameSite=Strict',
        ]);
        const maxAge = Number(cookie.attributes[2].slice('Max-Age='.length));
        expect(maxAge).toBeGreaterThan(7 * DAY_S - 60);
        expect(maxAge).toBeLessThanOrEqual(7 * DAY_S);

        // The token in the cookie is a real session of this user.
        const stored = await tokens.findOne({
          where: { tokenHash: hashToken(cookie.value) },
          relations: { user: true },
        });
        expect(stored?.user.id).toBe(staff().id);

        // The access token works like any other.
        await http()
          .get('/api/users/me')
          .set(bearer(data.accessToken as string))
          .expect(200);
      },
    );

    it('accepts the email in any letter case, never the name (400)', async () => {
      await login(editor.email.toUpperCase()).expect(200);
      await login(editor.name).expect(400);
    });

    it('refuses a customer with the right password: 403 NOT_STAFF, and no session', async () => {
      const res = await login(customer.email).expect(403);

      expect(errorOf(res)).toMatchObject({ code: 'NOT_STAFF' });
      expect(adminRefreshCookie(res)).toBeUndefined();
      expect(await tokens.count()).toBe(0);
    });

    it.each([
      ['a wrong password', () => admin.email, 'wrong password'],
      ['an unknown account', () => 'nobody@example.com', TEST_PASSWORD],
      // Not NOT_STAFF: a stranger learns nothing about the account's role.
      [
        'a customer with a wrong password',
        () => customer.email,
        'wrong password',
      ],
    ])(
      'answers %s with 401 INVALID_CREDENTIALS',
      async (_, email, password) => {
        const res = await login(email(), password).expect(401);

        expect(errorOf(res)).toMatchObject({ code: 'INVALID_CREDENTIALS' });
        expect(adminRefreshCookie(res)).toBeUndefined();
      },
    );

    it('refuses a blocked editor: 403 ACCOUNT_BLOCKED', async () => {
      await dataSource.getRepository(User).update(editor.id, { blocked: true });

      const res = await login(editor.email).expect(403);

      expect(errorOf(res)).toMatchObject({ code: 'ACCOUNT_BLOCKED' });
      expect(await tokens.count()).toBe(0);
    });

    it('validates the body like /auth/login', async () => {
      await http()
        .post('/api/admin/auth/login')
        .set(SAME_ORIGIN)
        .send({ email: admin.email, password: TEST_PASSWORD, role: 'x' })
        .expect(400);
    });
  });

  describe('POST /admin/auth/refresh', () => {
    it('replaces the cookie and returns a new access token and the account', async () => {
      const { cookie } = await adminLoginAs(app, editor);

      const res = await refresh(cookie).expect(200);

      const { data } = res.body as { data: Record<string, unknown> };
      expect(Object.keys(data).sort()).toEqual([
        'accessToken',
        'expiresIn',
        'user',
      ]);
      expect(data.user).toMatchObject({ id: editor.id, role: 'editor' });
      expect(res.headers['cache-control']).toBe('no-store');
      const next = cookieOf(res);
      expect(next.value).toMatch(REFRESH_TOKEN);
      expect(next.value).not.toBe(cookie.value);
      expect(next.attributes).toEqual(
        expect.arrayContaining([
          'Path=/api/admin/auth',
          'HttpOnly',
          'SameSite=Strict',
        ]),
      );

      // The new cookie works; the old one is used up (and deleted on sight).
      await refresh(next).expect(200);
      expectCookieDeleted(await refresh(cookie).expect(401));
    });

    it('answers 401 INVALID_REFRESH_TOKEN without a cookie, and deletes any', async () => {
      const res = await refresh().expect(401);

      expect(errorOf(res)).toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
      expectCookieDeleted(res);
    });

    it('ignores a refresh token sent in the body: only the cookie counts', async () => {
      const { cookie } = await adminLoginAs(app, editor);

      await http()
        .post('/api/admin/auth/refresh')
        .set(SAME_ORIGIN)
        .send({ refreshToken: cookie.value })
        .expect(401);
    });

    it('ends the session of an editor who is no longer staff: 403 NOT_STAFF', async () => {
      const { cookie } = await adminLoginAs(app, editor);
      await dataSource
        .getRepository(User)
        .update(editor.id, { role: UserRole.Customer });

      const res = await refresh(cookie).expect(403);

      expect(errorOf(res)).toMatchObject({ code: 'NOT_STAFF' });
      expectCookieDeleted(res);
      expect(await sessionEnded(cookie.value)).toBe(true);
    });

    it('refuses a blocked editor and ends the session', async () => {
      const { cookie } = await adminLoginAs(app, editor);
      await dataSource.getRepository(User).update(editor.id, { blocked: true });

      expectCookieDeleted(await refresh(cookie).expect(401));
      expect(await sessionEnded(cookie.value)).toBe(true);
    });

    it('ends the whole session when a used cookie comes back after the grace window', async () => {
      const { cookie } = await adminLoginAs(app, editor);
      const next = cookieOf(await refresh(cookie).expect(200));

      // As if it was used up longer ago than the grace window.
      await tokens.update(
        { tokenHash: hashToken(cookie.value) },
        { revokedAt: new Date(Date.now() - REUSE_GRACE_MS - 1000) },
      );
      await refresh(cookie).expect(401);

      expect(await sessionEnded(next.value)).toBe(true);
      await refresh(next).expect(401);
    });
  });

  describe('POST /admin/auth/logout', () => {
    it('ends the session and deletes the cookie', async () => {
      const { cookie } = await adminLoginAs(app, admin);

      const res = await logout(cookie).expect(204);

      expectCookieDeleted(res);
      expect(await sessionEnded(cookie.value)).toBe(true);
      await refresh(cookie).expect(401);
    });

    it('answers 204 without a cookie, or with an unknown one', async () => {
      expectCookieDeleted(await logout().expect(204));
      await http()
        .post('/api/admin/auth/logout')
        .set(SAME_ORIGIN)
        .set('Cookie', 'sf_admin_refresh=unknown')
        .expect(204);
    });

    it('leaves other sessions of the same user alone', async () => {
      const first = await adminLoginAs(app, admin);
      const second = await adminLoginAs(app, admin);

      await logout(first.cookie).expect(204);

      await refresh(second.cookie).expect(200);
    });
  });

  describe('requests from other sites', () => {
    it.each([
      ['another site', { Origin: 'https://evil.example' }],
      ['a sibling subdomain', { Origin: 'http://shop.admin.test' }],
      ['no Origin header', {}],
      ['Origin: null', { Origin: 'null' }],
    ])('are refused with 403 CROSS_ORIGIN_REQUEST: %s', async (_, headers) => {
      const { cookie } = await adminLoginAs(app, admin);

      for (const path of ['login', 'refresh', 'logout']) {
        const res = await http()
          .post(`/api/admin/auth/${path}`)
          .set({ Host: 'admin.test', ...headers })
          .set('Cookie', cookie.header)
          .send({ email: admin.email, password: TEST_PASSWORD })
          .expect(403);

        expect(errorOf(res)).toMatchObject({ code: 'CROSS_ORIGIN_REQUEST' });
        expect(adminRefreshCookie(res)).toBeUndefined();
      }
      // Nothing happened to the session: the cookie still works.
      await refresh(cookie).expect(200);
      expect(await tokens.count()).toBe(2);
    });

    it("don't count towards the login limit", async () => {
      for (let i = 0; i < 6; i++) {
        await http()
          .post('/api/admin/auth/login')
          .set({ Host: 'admin.test', Origin: 'https://evil.example' })
          .send({ email: admin.email, password: 'wrong password' })
          .expect(403);
      }

      await login(admin.email).expect(200);
    });
  });

  describe('rate limits', () => {
    it('blocks the 6th login in a minute per IP and email, for 5 minutes', async () => {
      for (let i = 0; i < 5; i++) {
        await login(admin.email, 'wrong password').expect(401);
      }

      const res = await login(admin.email).expect(429);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(295);
      // Another account behind the same IP is unaffected.
      await login(editor.email).expect(200);
    });

    it.each(['refresh', 'logout'])(
      'allows 30 %s calls a minute per IP',
      async (path) => {
        for (let i = 0; i < 30; i++) {
          await http()
            .post(`/api/admin/auth/${path}`)
            .set(SAME_ORIGIN)
            .expect((res) => expect(res.status).not.toBe(429));
        }

        await http()
          .post(`/api/admin/auth/${path}`)
          .set(SAME_ORIGIN)
          .expect(429);
      },
    );
  });

  it("the public API's login is unchanged: customers in, refresh token in the body", async () => {
    const res = await http()
      .post('/api/auth/login')
      .send({ email: customer.email, password: TEST_PASSWORD })
      .expect(200);

    expect(res.body.data.refreshToken).toMatch(REFRESH_TOKEN);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});
