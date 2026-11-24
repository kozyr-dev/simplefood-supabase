import { Controller, Get, INestApplication } from '@nestjs/common';
import { Writable } from 'node:stream';
import type { Params } from 'nestjs-pino';
import type { Options } from 'pino-http';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Public } from '@/auth/decorators/public.decorator';
import { REQUEST_ID_HEADER } from '@/common/logging/constants';
import loggerConfig from '@/config/logger.config';
import { UserRole } from '@/users/entities/user.entity';
import {
  adminLoginAs,
  adminRefreshCookie,
  bearer,
  loginAs,
  SAME_ORIGIN,
} from './utils/auth';
import { resetDatabase } from './utils/database';
import { createUser, TEST_PASSWORD } from './utils/factories';
import { testImage } from './utils/images';
import { linkToken, mailbox } from './utils/mail';
import { createTestApp, UUID } from './utils/test-app';
import { resetRateLimits } from './utils/throttler';

/** Test-only routes; registered only in this testing module. */
@Public()
@Controller('logging-test')
class LoggingTestController {
  @Get('crash')
  crash(): never {
    throw new Error('connection failed: password=secret123');
  }
}

interface LogLine {
  level: number;
  msg: string;
  adminId?: string;
  method?: string;
  route?: string;
  recordId?: string;
  reqId?: string;
  context?: string;
  req?: {
    id: string;
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  res?: { statusCode: number };
}

describe('Logging and request IDs (e2e)', () => {
  let app: INestApplication<App>;
  let lines: LogLine[] = [];

  beforeAll(async () => {
    // The real logger options (redaction, request IDs, levels), but at `info`
    // and written to memory, so the tests can read the log lines.
    const sink = new Writable({
      write(chunk: Buffer, _encoding, done) {
        for (const line of chunk.toString().split('\n').filter(Boolean)) {
          lines.push(JSON.parse(line) as LogLine);
        }
        done();
      },
    });
    const options = loggerConfig().pinoHttp as Options;
    const captured: Params = {
      pinoHttp: [{ ...options, level: 'info' }, sink],
    };

    app = await createTestApp({
      controllers: [LoggingTestController],
      override: (builder) =>
        builder.overrideProvider(loggerConfig.KEY).useValue(captured),
    });
  });

  beforeEach(() => {
    lines = [];
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const requestLine = (id: string) => lines.find((line) => line.req?.id === id);

  describe('X-Request-Id', () => {
    it('is generated when the client sends none', async () => {
      const res = await http().get('/api/ping').expect(200);

      expect(res.headers['x-request-id']).toMatch(UUID);
    });

    it('reuses a valid incoming ID', async () => {
      const res = await http()
        .get('/api/ping')
        .set(REQUEST_ID_HEADER, 'nginx-abc-123')
        .expect(200);

      expect(res.headers['x-request-id']).toBe('nginx-abc-123');
      expect(requestLine('nginx-abc-123')).toBeDefined();
    });

    it.each([
      ['too long', 'a'.repeat(65)],
      ['with spaces', 'not a valid id'],
      ['with JSON characters', 'x"}{"level":60'],
    ])('replaces an incoming ID that is %s', async (_label, incoming) => {
      const res = await http()
        .get('/api/ping')
        .set(REQUEST_ID_HEADER, incoming);

      expect(res.headers['x-request-id']).toMatch(UUID);
    });

    it('is exposed to browsers through CORS', async () => {
      const res = await http()
        .get('/api/ping')
        .set('Origin', 'http://localhost:3000');

      expect(res.headers['access-control-expose-headers']).toContain(
        REQUEST_ID_HEADER,
      );
    });
  });

  describe('requestId in error bodies', () => {
    it('matches the response header', async () => {
      const res = await http().get('/api/does-not-exist').expect(404);

      expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    });

    // These fail in Express's body parser / URL decoding, before pino-http's
    // middleware runs; the filter must still assign an ID and log them.
    it.each([
      [
        'malformed JSON',
        () =>
          http()
            .post('/api')
            .set('Content-Type', 'application/json')
            .send('{"email":'),
        400,
      ],
      [
        'a too-large body',
        () =>
          http()
            .post('/api')
            .send({ padding: 'x'.repeat(200 * 1024) }),
        413,
      ],
    ])(
      'is set for %s, rejected before routing',
      async (_label, send, status) => {
        const res = await send().expect(status);
        const id = res.headers['x-request-id'];

        expect(id).toMatch(UUID);
        expect(res.body.error.requestId).toBe(id);
        expect(
          lines.find((line) => line.level === 40 && line.msg.includes(id)),
        ).toBeDefined();
      },
    );
  });

  describe('log lines', () => {
    it('writes one request line per request, with its outcome', async () => {
      const res = await http().get('/api/does-not-exist').expect(404);
      const line = requestLine(res.headers['x-request-id']);

      expect(line).toMatchObject({
        level: 40, // warn
        msg: 'request completed',
        req: { method: 'GET', url: '/api/does-not-exist' },
        res: { statusCode: 404 },
      });
    });

    it('ties the error log and the request line of a 500 to one request ID', async () => {
      const res = await http().get('/api/logging-test/crash').expect(500);
      const id = res.headers['x-request-id'];

      const filterLine = lines.find(
        (line) => line.context === 'AllExceptionsFilter' && line.level === 50,
      );
      expect(filterLine?.reqId).toBe(id);
      expect(requestLine(id)).toMatchObject({
        level: 50,
        res: { statusCode: 500 },
      });
      expect(res.body.error.requestId).toBe(id);
      // The real cause is in the logs, never in the response.
      expect(JSON.stringify(filterLine)).toContain('secret123');
      expect(JSON.stringify(res.body)).not.toContain('secret123');
    });

    it('redacts credentials', async () => {
      const res = await http()
        .get('/api/ping')
        .set('Authorization', 'Bearer secret-token')
        .set('Cookie', 'refresh_token=secret-cookie')
        .expect(200);

      const line = requestLine(res.headers['x-request-id']);
      expect(line?.req?.headers.authorization).toBe('[Redacted]');
      expect(line?.req?.headers.cookie).toBe('[Redacted]');
      expect(JSON.stringify(lines)).not.toMatch(/secret-token|secret-cookie/);
    });

    // Here, not in password-reset.e2e-spec.ts: nestjs-pino keeps one logger
    // per process, so only the first app of a test file can capture its logs.
    it('never logs a password-reset token, the email or the new password', async () => {
      const dataSource = app.get(DataSource);
      await resetDatabase(dataSource);
      resetRateLimits(app);
      await createUser(dataSource, { email: 'ivan@example.com' });
      const newPassword = 'a brand new secret';

      await http()
        .post('/api/auth/forgot-password')
        .send({ email: 'ivan@example.com' })
        .expect(204);
      const token = linkToken((await mailbox(app)).sent.at(-1));
      const reset = () =>
        http().post('/api/auth/reset-password').send({ token, newPassword });
      await reset().expect(204);
      await reset().expect(400); // a warn line, with the request

      expect(
        lines.filter((line) => line.req?.url === '/api/auth/reset-password'),
      ).toHaveLength(2);
      const logged = JSON.stringify(lines);
      for (const secret of [token, 'ivan@example.com', newPassword]) {
        expect(logged).not.toContain(secret);
      }
    });

    it('logs an upload without its file name, and no line per image served', async () => {
      const dataSource = app.get(DataSource);
      await resetDatabase(dataSource);
      resetRateLimits(app);
      const editor = await createUser(dataSource, { role: UserRole.Editor });
      const { accessToken } = await loginAs(app, editor);

      const res = await http()
        .post('/api/media')
        .set(bearer(accessToken))
        .attach('file', await testImage(600, 400), 'Олена-вдома.jpg')
        .expect(201);
      const { url } = (res.body as { data: { url: string } }).data;
      await http().get(url).expect(200);

      expect(
        lines.filter((line) => line.req?.url === '/api/media'),
      ).toHaveLength(1);
      expect(
        lines.filter((line) => line.req?.url?.startsWith('/uploads')),
      ).toEqual([]);
      expect(JSON.stringify(lines)).not.toContain('Олена');
    });

    it('never logs a verification token, the email or the password', async () => {
      const dataSource = app.get(DataSource);
      await resetDatabase(dataSource);
      resetRateLimits(app);
      const email = 'olena@example.com';
      const password = 'olena secret pass';

      await http()
        .post('/api/auth/register')
        .send({ name: 'Olena', email, password })
        .expect(201);
      const token = linkToken((await mailbox(app)).sent.at(-1));
      const verify = () =>
        http().post('/api/auth/verify-email').send({ token });
      await verify().expect(204);
      await verify().expect(400); // a warn line, with the request

      expect(
        lines.filter((line) => line.req?.url === '/api/auth/verify-email'),
      ).toHaveLength(2);
      const logged = JSON.stringify(lines);
      for (const secret of [token, email, password]) {
        expect(logged).not.toContain(secret);
      }
    });

    it("never logs the admin app's refresh token, the email or the password", async () => {
      const dataSource = app.get(DataSource);
      await resetDatabase(dataSource);
      resetRateLimits(app);
      const editor = await createUser(dataSource, {
        email: 'editor@example.com',
        role: UserRole.Editor,
      });

      const { cookie } = await adminLoginAs(app, editor);
      const refreshed = await http()
        .post('/api/admin/auth/refresh')
        .set(SAME_ORIGIN)
        .set('Cookie', cookie.header)
        .expect(200);
      const next = adminRefreshCookie(refreshed);
      // The used cookie again: a warn line, with the request.
      await http()
        .post('/api/admin/auth/refresh')
        .set(SAME_ORIGIN)
        .set('Cookie', cookie.header)
        .expect(401);

      expect(
        lines.filter((line) => line.req?.url?.startsWith('/api/admin/auth')),
      ).toHaveLength(3);
      const logged = JSON.stringify(lines);
      for (const secret of [
        cookie.value,
        next?.value,
        'editor@example.com',
        TEST_PASSWORD,
      ]) {
        expect(logged).not.toContain(secret);
      }
    });

    it('writes one audit line per admin write: who, route pattern, record; no values', async () => {
      const dataSource = app.get(DataSource);
      await resetDatabase(dataSource);
      resetRateLimits(app);
      const editor = await createUser(dataSource, { role: UserRole.Editor });
      const { accessToken } = await loginAs(app, editor);
      const write = () =>
        http()
          .post('/api/admin/product-categories')
          .set(bearer(accessToken))
          .send({ name: 'Секретна назва', slug: 'secret-name' });

      const created = await write().expect(201);
      await write().expect(409); // a failed write: no audit line
      await http()
        .get('/api/admin/product-categories')
        .set(bearer(accessToken))
        .expect(200); // a read: no audit line

      const audit = lines.filter((line) => line.msg === 'Admin action');
      expect(audit).toEqual([
        expect.objectContaining({
          context: 'AdminAudit',
          adminId: editor.id,
          method: 'POST',
          route: '/api/admin/product-categories',
          recordId: (created.body as { data: { id: string } }).data.id,
        }),
      ]);
      expect(JSON.stringify(audit)).not.toMatch(/Секретна|secret-name/);
    });

    it('does not log health-check requests', async () => {
      await http().get('/health');

      expect(lines.filter((line) => line.req?.url === '/health')).toHaveLength(
        0,
      );
    });
  });
});
