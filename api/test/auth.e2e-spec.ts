import { Controller, Get, INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, type Repository } from 'typeorm';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import type { AuthResultDto } from '@/auth/dto/auth-result.dto';
import type { AuthTokensDto } from '@/auth/dto/auth-tokens.dto';
import { RefreshToken } from '@/auth/entities/refresh-token.entity';
import {
  RefreshTokensService,
  REUSE_GRACE_MS,
} from '@/auth/services/refresh-tokens.service';
import type { AuthUser } from '@/auth/types/auth.types';
import { hashToken } from '@/common/crypto/tokens';
import authConfig from '@/config/auth.config';
import { User, UserRole } from '@/users/entities/user.entity';
import { bearer, loginAs } from './utils/auth';
import { resetDatabase } from './utils/database';
import { createUser, daysFromNow, TEST_PASSWORD } from './utils/factories';
import { createTestApp, UUID } from './utils/test-app';
import { resetRateLimits } from './utils/throttler';

/** Needs a login; stands in for any protected route. */
@Controller('auth-test')
class ProtectedController {
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}

/** Strapi's bcryptjs hash (cost 10) of STRAPI_PASSWORD. */
const STRAPI_HASH =
  '$2a$10$KmHCmk4RGi9/OYM.18Bh6uwVYnHew3f7i0zBXzh7/nFHEQZueiCZa';
const STRAPI_PASSWORD = 'Simple-Food-7';

const JWT = /^[\w-]+\.[\w-]+\.[\w-]+$/;
const REFRESH_TOKEN = /^[\w-]{43}$/;
const ISO_DATE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let users: Repository<User>;
  let tokens: Repository<RefreshToken>;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [ProtectedController] });
    dataSource = app.get(DataSource);
    users = dataSource.getRepository(User);
    tokens = dataSource.getRepository(RefreshToken);
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
    resetRateLimits(app);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (path: string, body: object, token?: string) =>
    request(app.getHttpServer())
      .post(`/api/auth/${path}`)
      .set(token ? bearer(token) : {})
      .send(body);

  const whoAmI = (token: string) =>
    request(app.getHttpServer()).get('/api/auth-test/me').set(bearer(token));

  const refresh = (refreshToken: string) => post('refresh', { refreshToken });

  const storedHash = async (id: string) =>
    (
      await users
        .createQueryBuilder('user')
        .addSelect('user.passwordHash')
        .where('user.id = :id', { id })
        .getOneOrFail()
    ).passwordHash;

  const ageToken = (token: string, changes: Partial<RefreshToken>) =>
    tokens.update({ tokenHash: hashToken(token) }, changes);

  /** The error body, without the per-request id. */
  const errorOf = (res: request.Response) => {
    const { requestId, ...rest } = (
      res.body as { error: { requestId: string } }
    ).error;
    expect(requestId).toMatch(UUID);
    return rest;
  };

  describe('caching', () => {
    it('forbids caching every response that carries tokens', async () => {
      const user = await createUser(dataSource);
      const login = await post('login', {
        email: user.email,
        password: TEST_PASSWORD,
      }).expect(200);
      const { refreshToken, accessToken } = (
        login.body as { data: AuthResultDto }
      ).data;
      const responses = [
        login,
        await post('register', {
          name: 'Someone New',
          email: 'new@example.com',
          password: TEST_PASSWORD,
        }).expect(201),
        await refresh(refreshToken).expect(200),
        await post(
          'change-password',
          { currentPassword: TEST_PASSWORD, newPassword: 'battery staple' },
          accessToken,
        ).expect(200),
      ];

      for (const res of responses) {
        expect(res.headers['cache-control']).toBe('no-store');
      }
    });
  });

  describe('POST /auth/register', () => {
    const body = {
      name: 'Ivan Petrenko',
      email: 'Ivan@Example.com',
      password: 'correct horse',
      phone: '+380 67 123 45 67',
    };

    it('creates a customer and logs them in (201)', async () => {
      const res = await post('register', body).expect(201);
      const { data } = res.body as { data: AuthResultDto };

      expect(data).toEqual({
        accessToken: expect.stringMatching(JWT),
        expiresIn: 900,
        refreshToken: expect.stringMatching(REFRESH_TOKEN),
        refreshTokenExpiresAt: expect.stringMatching(ISO_DATE),
        user: {
          id: expect.stringMatching(/^[0-9a-f-]{36}$/),
          name: 'Ivan Petrenko',
          email: 'Ivan@Example.com',
          emailVerified: false,
          phone: '+380 67 123 45 67',
          address: null,
          role: 'customer',
          createdAt: expect.stringMatching(ISO_DATE),
        },
      });
      // Both tokens work right away.
      await whoAmI(data.accessToken).expect(200);
      await refresh(data.refreshToken).expect(200);
    });

    it('stores a bcrypt hash, never the password', async () => {
      const res = await post('register', body).expect(201);

      const hash = await storedHash(res.body.data.user.id);
      expect(hash).toMatch(/^\$2b\$04\$/); // BCRYPT_ROUNDS=4 in the e2e env
      expect(await bcrypt.compare(body.password, hash!)).toBe(true);
      expect(JSON.stringify(res.body)).not.toContain(hash);
    });

    it('keeps spaces around the password: they are part of it', async () => {
      await post('register', { ...body, password: '  spaced out  ' }).expect(
        201,
      );

      await post('login', {
        email: body.email,
        password: '  spaced out  ',
      }).expect(200);
      await post('login', {
        email: body.email,
        password: 'spaced out',
      }).expect(401);
    });

    it('refuses an email that differs only in case: 409 EMAIL_TAKEN', async () => {
      await post('register', body).expect(201);

      const res = await post('register', {
        ...body,
        name: 'Someone Else',
        email: 'ivan@EXAMPLE.com',
      }).expect(409);

      expect(errorOf(res)).toEqual({
        status: 409,
        code: 'EMAIL_TAKEN',
        message: 'An account with this email already exists',
      });
    });

    it('lets accounts share a name, in any case: only the email is unique', async () => {
      await post('register', body).expect(201);

      await post('register', {
        ...body,
        email: 'other@example.com',
      }).expect(201);
      await post('register', {
        ...body,
        name: 'IVAN petrenko',
        email: 'third@example.com',
      }).expect(201);

      expect(await users.count()).toBe(3);
    });

    it('lets only one of two parallel registrations with one email through', async () => {
      const statuses = await Promise.all(
        ['First', 'Second'].map(
          async (name) => (await post('register', { ...body, name })).status,
        ),
      );

      expect(statuses.sort((a, b) => a - b)).toEqual([201, 409]);
      expect(await users.count()).toBe(1);
    });

    it('leaves no account behind when the session cannot be started', async () => {
      jest
        .spyOn(RefreshTokensService.prototype, 'issue')
        .mockRejectedValueOnce(new Error('database went away'));

      await post('register', body).expect(500);

      expect(await users.count()).toBe(0);
      // The email is still free.
      await post('register', body).expect(201);
    });

    it('refuses a role in the body (400): nobody can register as admin', async () => {
      const res = await post('register', { ...body, role: 'admin' }).expect(
        400,
      );

      expect(errorOf(res)).toMatchObject({
        code: 'BAD_REQUEST',
        details: [
          { field: 'role', messages: ['property role should not exist'] },
        ],
      });
      expect(await users.count()).toBe(0);
    });

    it('refuses an invalid body with every problem listed (400)', async () => {
      const res = await post('register', {
        name: 'I',
        email: 'not-an-email',
        password: 'ж'.repeat(37),
      }).expect(400);

      // In any order (RegisterDto's own field comes before the inherited ones).
      const fields = (res.body.error.details as { field: string }[]).map(
        (d) => d.field,
      );
      expect(fields).toHaveLength(3);
      expect(fields).toEqual(
        expect.arrayContaining(['name', 'email', 'password']),
      );
    });
  });

  describe('POST /auth/login', () => {
    let user: User;

    beforeEach(async () => {
      user = await createUser(dataSource, {
        name: 'Ivan Petrenko',
        email: 'ivan@example.com',
      });
    });

    it.each([
      ['the email', 'ivan@example.com'],
      ['the email in another case', 'IVAN@Example.COM'],
    ])('logs in with %s (200)', async (_, email) => {
      const res = await post('login', {
        email,
        password: TEST_PASSWORD,
      }).expect(200);
      const { data } = res.body as { data: AuthResultDto };

      expect(data.user).toMatchObject({ id: user.id, role: 'customer' });
      expect(data.refreshToken).toMatch(REFRESH_TOKEN);
      expect((await whoAmI(data.accessToken).expect(200)).body).toEqual({
        id: user.id,
        role: 'customer',
      });
    });

    it('refuses the name instead of the email (400): names are not unique', async () => {
      const res = await post('login', {
        email: 'Ivan Petrenko',
        password: TEST_PASSWORD,
      }).expect(400);

      expect(errorOf(res)).toMatchObject({
        code: 'BAD_REQUEST',
        details: [
          { field: 'email', messages: ['email must be an email address'] },
        ],
      });
    });

    it('refuses the old identifier field (400)', async () => {
      const res = await post('login', {
        identifier: 'ivan@example.com',
        password: TEST_PASSWORD,
      }).expect(400);

      expect(
        (res.body.error.details as { field: string }[]).map((d) => d.field),
      ).toEqual(expect.arrayContaining(['email', 'identifier']));
    });

    it('answers a wrong password and an unknown user with the same 401', async () => {
      const wrongPassword = await post('login', {
        email: 'ivan@example.com',
        password: 'wrong password',
      }).expect(401);
      const unknownUser = await post('login', {
        email: 'nobody@example.com',
        password: TEST_PASSWORD,
      }).expect(401);

      expect(errorOf(wrongPassword)).toEqual({
        status: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
      expect(errorOf(unknownUser)).toEqual(errorOf(wrongPassword));
    });

    it('refuses a blocked user with 403, but only after the right password', async () => {
      await users.update(user.id, { blocked: true });

      const right = await post('login', {
        email: user.email,
        password: TEST_PASSWORD,
      }).expect(403);
      expect(errorOf(right)).toEqual({
        status: 403,
        code: 'ACCOUNT_BLOCKED',
        message: 'This account is blocked',
      });
      await post('login', {
        email: user.email,
        password: 'wrong password',
      }).expect(401);
      expect(await tokens.count()).toBe(0);
    });

    it('starts a separate session on every login', async () => {
      const first = await loginAs(app, user);
      const second = await loginAs(app, user);

      const [a, b] = await Promise.all(
        [first, second].map(({ refreshToken }) =>
          tokens.findOneByOrFail({ tokenHash: hashToken(refreshToken) }),
        ),
      );
      expect(a.familyId).not.toBe(b.familyId);
    });

    it('does not re-hash a hash that is already strong enough', async () => {
      const before = await storedHash(user.id);

      await loginAs(app, user);

      expect(await storedHash(user.id)).toBe(before);
    });
  });

  // Separate app: re-hashing only happens when BCRYPT_ROUNDS is above the
  // stored cost, and the shared e2e env uses the minimum (4).
  describe('POST /auth/login with an account migrated from Strapi', () => {
    let strictApp: INestApplication<App>;

    beforeAll(async () => {
      strictApp = await createTestApp({
        override: (builder) =>
          builder
            .overrideProvider(authConfig.KEY)
            .useValue({ ...authConfig(), bcryptRounds: 11 }),
      });
    });

    afterAll(async () => {
      await strictApp.close();
    });

    it('accepts the $2a$10$ hash and re-hashes it at the configured cost', async () => {
      const user = await createUser(dataSource);
      await users.update(user.id, { passwordHash: STRAPI_HASH });

      await loginAs(strictApp, user, STRAPI_PASSWORD);

      const upgraded = await storedHash(user.id);
      expect(upgraded).toMatch(/^\$2b\$11\$/);
      expect(await bcrypt.compare(STRAPI_PASSWORD, upgraded!)).toBe(true);
      // And the upgraded hash keeps working.
      await loginAs(strictApp, user, STRAPI_PASSWORD);
    });

    it('logs in a legacy password over 72 bytes, leaving its hash as is', async () => {
      // bcrypt (and Strapi's bcryptjs) only ever used the first 72 bytes.
      const long = 'x'.repeat(80);
      const user = await createUser(dataSource);
      const legacy = await bcrypt.hash(long, 10);
      await users.update(user.id, { passwordHash: legacy });

      await loginAs(strictApp, user, long);

      expect(await storedHash(user.id)).toBe(legacy);
    });
  });

  describe('POST /auth/refresh', () => {
    let user: User;
    let session: AuthResultDto;

    beforeEach(async () => {
      user = await createUser(dataSource);
      session = await loginAs(app, user);
    });

    it('the refresh flow: call, token expires, 401, refresh, retry succeeds', async () => {
      await whoAmI(session.accessToken).expect(200);

      // 16 minutes later: the 15-minute access token has expired.
      const later = Date.now() + 16 * 60 * 1000;
      jest.spyOn(Date, 'now').mockReturnValue(later);
      const expired = await whoAmI(session.accessToken).expect(401);
      expect(expired.headers['www-authenticate']).toBe(
        'Bearer error="invalid_token"',
      );
      jest.restoreAllMocks();

      const res = await refresh(session.refreshToken).expect(200);
      const { data } = res.body as { data: AuthTokensDto };
      expect(data).toEqual({
        accessToken: expect.stringMatching(JWT),
        expiresIn: 900,
        refreshToken: expect.stringMatching(REFRESH_TOKEN),
        refreshTokenExpiresAt: expect.stringMatching(ISO_DATE),
      });
      await whoAmI(data.accessToken).expect(200);
    });

    it('rotates: the token sent is used up, the new one works', async () => {
      const next = (await refresh(session.refreshToken).expect(200)).body
        .data as AuthTokensDto;

      expect(next.refreshToken).not.toBe(session.refreshToken);
      await refresh(next.refreshToken).expect(200);
    });

    it('carries a role changed since login into the new access token', async () => {
      await users.update(user.id, { role: UserRole.Editor });

      const { data } = (await refresh(session.refreshToken).expect(200))
        .body as { data: AuthTokensDto };

      expect((await whoAmI(data.accessToken)).body.role).toBe('editor');
    });

    it('a used token sent again later ends the session (reuse detection)', async () => {
      const stolen = session.refreshToken;
      const current = (await refresh(stolen).expect(200)).body.data
        .refreshToken as string;
      await ageToken(stolen, {
        revokedAt: new Date(Date.now() - REUSE_GRACE_MS - 1000),
      });

      const res = await refresh(stolen).expect(401);

      expect(errorOf(res)).toEqual({
        status: 401,
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid refresh token',
      });
      // The legitimate client's token is gone too: it has to log in again.
      await refresh(current).expect(401);
    });

    it('a used token sent again right away is refused, but the session lives (grace window)', async () => {
      const current = (await refresh(session.refreshToken).expect(200)).body
        .data.refreshToken as string;

      await refresh(session.refreshToken).expect(401);
      await refresh(current).expect(200);
    });

    it('two parallel refreshes with one token: exactly one succeeds', async () => {
      const statuses = await Promise.all(
        [1, 2].map(async () => (await refresh(session.refreshToken)).status),
      );

      expect(statuses.sort((a, b) => a - b)).toEqual([200, 401]);
    });

    it('refuses a token unused for 7 days', async () => {
      await ageToken(session.refreshToken, { expiresAt: daysFromNow(-0.01) });

      await refresh(session.refreshToken).expect(401);
    });

    it('refuses a token once the session is 30 days old', async () => {
      await ageToken(session.refreshToken, {
        familyExpiresAt: daysFromNow(-0.01),
      });

      await refresh(session.refreshToken).expect(401);
    });

    it('refuses a blocked user', async () => {
      await users.update(user.id, { blocked: true });

      await refresh(session.refreshToken).expect(401);
    });

    it.each([
      ['an unknown token', 401, () => ({ refreshToken: 'a'.repeat(43) })],
      ['an access token', 401, () => ({ refreshToken: session.accessToken })],
      ['an empty body', 400, () => ({})],
    ])('answers %s with %d', async (_, status, body) => {
      await post('refresh', body()).expect(status);
    });
  });

  describe('POST /auth/logout', () => {
    let user: User;

    beforeEach(async () => {
      user = await createUser(dataSource);
    });

    it('ends that session only (204)', async () => {
      const phone = await loginAs(app, user);
      const laptop = await loginAs(app, user);

      const res = await post('logout', {
        refreshToken: phone.refreshToken,
      }).expect(204);

      expect(res.text).toBe('');
      await refresh(phone.refreshToken).expect(401);
      await refresh(laptop.refreshToken).expect(200);
    });

    it('needs no access token: it has usually expired by then', async () => {
      const { refreshToken } = await loginAs(app, user);

      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .send({ refreshToken })
        .expect(204);
    });

    it('answers an unknown or already used token with 204 too', async () => {
      await post('logout', { refreshToken: 'unknown' }).expect(204);
      const { refreshToken } = await loginAs(app, user);
      await post('logout', { refreshToken }).expect(204);
      await post('logout', { refreshToken }).expect(204);
    });

    it('refuses a body without a token (400)', async () => {
      await post('logout', {}).expect(400);
    });
  });

  describe('POST /auth/change-password', () => {
    const NEW_PASSWORD = 'battery staple horse';
    let user: User;
    let session: AuthResultDto;

    beforeEach(async () => {
      user = await createUser(dataSource);
      session = await loginAs(app, user);
    });

    const changePassword = (body: object, token = session.accessToken) =>
      post('change-password', body, token);

    it('needs a login (401)', async () => {
      await post('change-password', {
        currentPassword: TEST_PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(401);
    });

    it('refuses a wrong current password with 400 WRONG_PASSWORD, changing nothing', async () => {
      const res = await changePassword({
        currentPassword: 'wrong password',
        newPassword: NEW_PASSWORD,
      }).expect(400);

      expect(errorOf(res)).toEqual({
        status: 400,
        code: 'WRONG_PASSWORD',
        message: 'Current password is incorrect',
      });
      await loginAs(app, user, TEST_PASSWORD);
      await refresh(session.refreshToken).expect(200);
    });

    it('refuses a new password that breaks the rules (400)', async () => {
      const res = await changePassword({
        currentPassword: TEST_PASSWORD,
        newPassword: 'short',
      }).expect(400);

      expect(res.body.error.details).toEqual([
        { field: 'newPassword', messages: [expect.any(String)] },
      ]);
    });

    it('sets the password, ends every session and returns a new pair', async () => {
      const otherDevice = await loginAs(app, user);

      const res = await changePassword({
        currentPassword: TEST_PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(200);
      const { data } = res.body as { data: AuthResultDto };

      expect(data.user).toMatchObject({ id: user.id });
      // Every earlier session is over, this device's included...
      await refresh(session.refreshToken).expect(401);
      await refresh(otherDevice.refreshToken).expect(401);
      // ...and the returned pair carries on.
      await whoAmI(data.accessToken).expect(200);
      await refresh(data.refreshToken).expect(200);
      // Only the new password logs in now.
      await post('login', {
        email: user.email,
        password: TEST_PASSWORD,
      }).expect(401);
      await loginAs(app, user, NEW_PASSWORD);
    });

    it.each([
      ['blocked', (id: string) => users.update(id, { blocked: true })],
      ['deleted', (id: string) => users.delete(id)],
    ])(
      'refuses a user %s since the token was issued (401)',
      async (_, change) => {
        await change(user.id);

        await changePassword({
          currentPassword: TEST_PASSWORD,
          newPassword: NEW_PASSWORD,
        }).expect(401);
      },
    );
  });
});
