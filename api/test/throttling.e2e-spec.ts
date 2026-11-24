import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { UserRole, type User } from '@/users/entities/user.entity';
import { bearer, loginAs } from './utils/auth';
import { resetDatabase } from './utils/database';
import { createUser, TEST_PASSWORD } from './utils/factories';
import { mailbox } from './utils/mail';
import { createTestApp, UUID } from './utils/test-app';
import { resetRateLimits } from './utils/throttler';

const MINUTE = 60_000;

/**
 * The production limits, untouched: each test starts from zero through
 * resetRateLimits(). Guards run before validation, so even a request the
 * route would reject (400, 401) counts.
 */
describe('Rate limits (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let user: User;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    // Forgot-password lookups run after the response: let the last test's
    // finish before emptying the tables they write to.
    await mailbox(app);
    await resetDatabase(dataSource);
    resetRateLimits(app);
    user = await createUser(dataSource, { email: 'ivan@example.com' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  const login = (email: string, password = 'wrong password') =>
    http().post('/api/auth/login').send({ email, password });

  /** Sends `count` requests one after another; their statuses. */
  async function statuses(count: number, send: () => request.Test) {
    const result: number[] = [];
    for (let i = 0; i < count; i++) {
      result.push((await send()).status);
    }
    return result;
  }

  /** Expects a 429 in the standard shape; returns its Retry-After seconds. */
  function retryAfterOf(res: request.Response): number {
    expect(res.status).toBe(429);
    const { requestId, ...error } = (
      res.body as { error: { requestId: string } }
    ).error;
    expect(requestId).toMatch(UUID);
    expect(error).toEqual({
      status: 429,
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests, try again later',
    });
    return Number(res.headers['retry-after']);
  }

  /** Moves the throttler's clock (it reads Date.now()) forward. */
  function advanceClock(ms: number) {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + ms);
  }

  describe('POST /auth/login: 5 per minute per IP and email', () => {
    it('refuses the 6th try with 429, even with the right password', async () => {
      expect(await statuses(5, () => login('ivan@example.com'))).toEqual([
        401, 401, 401, 401, 401,
      ]);

      const res = await login('ivan@example.com', TEST_PASSWORD);

      const retryAfter = retryAfterOf(res);
      expect(retryAfter).toBeGreaterThan(295);
      expect(retryAfter).toBeLessThanOrEqual(300);
    });

    it('keeps the block for 5 minutes, not just the 1-minute window', async () => {
      await statuses(6, () => login('ivan@example.com'));

      advanceClock(2 * MINUTE);
      const res = await login('ivan@example.com', TEST_PASSWORD).expect(429);
      expect(retryAfterOf(res)).toBeLessThanOrEqual(180);

      advanceClock(5 * MINUTE + 1000);
      await login('ivan@example.com', TEST_PASSWORD).expect(200);
    });

    it('counts the email in any case and with spaces as one', async () => {
      await statuses(3, () => login(' IVAN@example.com '));
      await statuses(2, () => login('Ivan@Example.com'));

      await login('ivan@example.com', TEST_PASSWORD).expect(429);
    });

    it("doesn't lock out other accounts behind the same IP", async () => {
      const other = await createUser(dataSource);
      await statuses(6, () => login('ivan@example.com'));

      await loginAs(app, other);
    });

    it('counts successful logins too', async () => {
      await statuses(5, () => login('ivan@example.com', TEST_PASSWORD));

      await login('ivan@example.com', TEST_PASSWORD).expect(429);
    });
  });

  it.each([
    ['POST /auth/register', 10, 3600, '/api/auth/register', {}],
    [
      'POST /auth/refresh',
      30,
      60,
      '/api/auth/refresh',
      { refreshToken: 'unknown' },
    ],
    ['POST /auth/logout', 30, 60, '/api/auth/logout', { refreshToken: 'x' }],
    [
      'POST /auth/reset-password',
      10,
      3600,
      '/api/auth/reset-password',
      { token: 'x' },
    ],
    [
      'POST /auth/verify-email',
      10,
      3600,
      '/api/auth/verify-email',
      { token: 'x' },
    ],
    // A guest: no token, so counted by IP (the browser calls the API directly).
    ['POST /orders (guest)', 10, 3600, '/api/orders', {}],
  ])(
    '%s: %i per window per IP, then 429 with Retry-After (≤ %is)',
    async (_, limit, windowSeconds, path, body) => {
      const allowed = await statuses(limit, () => http().post(path).send(body));
      expect(allowed).not.toContain(429);

      const retryAfter = retryAfterOf(await http().post(path).send(body));
      expect(retryAfter).toBeGreaterThan(windowSeconds - 5);
      expect(retryAfter).toBeLessThanOrEqual(windowSeconds);
    },
  );

  it.each([
    [
      'POST /auth/change-password',
      5,
      (token: string) =>
        http().post('/api/auth/change-password').set(bearer(token)).send({
          currentPassword: 'wrong password',
          newPassword: 'a brand new secret',
        }),
    ],
    [
      'PATCH /users/me',
      10,
      (token: string) =>
        http()
          .patch('/api/users/me')
          .set(bearer(token))
          .send({ currentPassword: 'wrong password' }),
    ],
    [
      'POST /orders',
      10,
      (token: string) => http().post('/api/orders').set(bearer(token)).send({}),
    ],
  ])(
    '%s: %i per window per account; other accounts on the same IP are unaffected',
    async (_, limit, send) => {
      const { accessToken } = await loginAs(app, user);
      const other = (await loginAs(app, await createUser(dataSource)))
        .accessToken;

      expect(await statuses(limit, () => send(accessToken))).toEqual(
        Array<number>(limit).fill(400),
      );
      retryAfterOf(await send(accessToken));

      await send(other).expect(400);
    },
  );

  it('POST /contact: 5 per hour per IP and email; other emails from the same IP are unaffected', async () => {
    const contact = (email: string) =>
      http().post('/api/contact').send({ email });

    expect(await statuses(5, () => contact('olena@example.com'))).toEqual(
      Array<number>(5).fill(400),
    );

    // The same address in any case, with spaces: the same sender.
    const retryAfter = retryAfterOf(await contact(' Olena@Example.com '));
    expect(retryAfter).toBeGreaterThan(3595);
    expect(retryAfter).toBeLessThanOrEqual(3600);
    await contact('ivan@example.com').expect(400);
  });

  it('POST /auth/forgot-password: 3 per hour per IP and email; other emails from the same IP are unaffected', async () => {
    const forgot = (email: string) =>
      http().post('/api/auth/forgot-password').send({ email });

    expect(await statuses(3, () => forgot('ivan@example.com'))).toEqual([
      204, 204, 204,
    ]);

    const retryAfter = retryAfterOf(await forgot(' IVAN@example.com '));
    expect(retryAfter).toBeGreaterThan(3595);
    expect(retryAfter).toBeLessThanOrEqual(3600);
    await forgot('olena@example.com').expect(204);
  });

  it('POST /media: 100 per hour per account; other editors on the same IP are unaffected', async () => {
    const editor = await createUser(dataSource, { role: UserRole.Editor });
    const { accessToken } = await loginAs(app, editor);
    const other = (
      await loginAs(
        app,
        await createUser(dataSource, { role: UserRole.Editor }),
      )
    ).accessToken;
    // No file: a quick 400, counted all the same.
    const upload = (token: string) =>
      http().post('/api/media').set(bearer(token));

    expect(await statuses(100, () => upload(accessToken))).toEqual(
      Array<number>(100).fill(400),
    );

    const retryAfter = retryAfterOf(await upload(accessToken));
    expect(retryAfter).toBeGreaterThan(3595);
    expect(retryAfter).toBeLessThanOrEqual(3600);
    await upload(other).expect(400);
  });

  it('POST /auth/resend-verification: 3 per hour per account; other accounts on the same IP are unaffected', async () => {
    const resend = (token: string) =>
      http().post('/api/auth/resend-verification').set(bearer(token));
    const { accessToken } = await loginAs(app, user);
    const other = (await loginAs(app, await createUser(dataSource)))
      .accessToken;

    expect(await statuses(3, () => resend(accessToken))).toEqual([
      204, 204, 204,
    ]);

    const retryAfter = retryAfterOf(await resend(accessToken));
    expect(retryAfter).toBeGreaterThan(3595);
    expect(retryAfter).toBeLessThanOrEqual(3600);
    await resend(other).expect(204);
  });

  it('ignores a forged X-Forwarded-For (TRUST_PROXY_HOPS=0)', async () => {
    await statuses(10, () =>
      http()
        .post('/api/auth/register')
        .set('X-Forwarded-For', '203.0.113.1')
        .send({}),
    );

    await http()
      .post('/api/auth/register')
      .set('X-Forwarded-For', '203.0.113.2')
      .send({})
      .expect(429);
  });

  it('lets browsers read Retry-After through CORS', async () => {
    const res = await http()
      .get('/api/ping')
      .set('Origin', 'http://localhost:3000');

    expect(res.headers['access-control-expose-headers']).toContain(
      'Retry-After',
    );
  });

  describe('no limit elsewhere (the site shares one IP)', () => {
    it('GET /users/me is not limited', async () => {
      const { accessToken } = await loginAs(app, user);

      const all = await statuses(40, () =>
        http().get('/api/users/me').set(bearer(accessToken)),
      );

      expect(all).toEqual(Array<number>(40).fill(200));
    });

    it.each(['/api/ping', '/api/products', '/health'])(
      '%s has no rate-limit headers',
      async (path) => {
        const res = await http().get(path);

        expect(res.headers).not.toHaveProperty('x-ratelimit-limit');
      },
    );

    it('a limited route does send them', async () => {
      const res = await login('ivan@example.com');

      expect(res.headers).toMatchObject({
        'x-ratelimit-limit': '5',
        'x-ratelimit-remaining': '4',
      });
    });
  });
});

describe('Rate limits behind a reverse proxy (e2e)', () => {
  it('counts each forwarded client separately (TRUST_PROXY_HOPS=1)', async () => {
    const app = await createTestApp({
      beforeConfigure: (app) => {
        const config = app.get(ConfigService);
        const realGetOrThrow = config.getOrThrow.bind(config);
        jest
          .spyOn(config, 'getOrThrow')
          .mockImplementation((key: string) =>
            key === 'TRUST_PROXY_HOPS' ? 1 : realGetOrThrow(key),
          );
      },
    });
    const register = (client: string) =>
      request(app.getHttpServer())
        .post('/api/auth/register')
        .set('X-Forwarded-For', client)
        .send({});
    try {
      for (let i = 0; i < 10; i++) {
        await register('203.0.113.1');
      }

      await register('203.0.113.1').expect(429);
      await register('203.0.113.2').expect(400);
    } finally {
      jest.restoreAllMocks();
      await app.close();
    }
  });
});
