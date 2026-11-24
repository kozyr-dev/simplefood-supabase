import { randomUUID } from 'node:crypto';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { OptionalAuth } from '@/auth/decorators/optional-auth.decorator';
import { Public } from '@/auth/decorators/public.decorator';
import { Roles } from '@/auth/decorators/roles.decorator';
import { AccessTokensService } from '@/auth/services/access-tokens.service';
import type { AuthUser } from '@/auth/types/auth.types';
import authConfig, { type AuthConfig } from '@/config/auth.config';
import { UserRole } from '@/users/entities/user.entity';
import { loginAs } from './utils/auth';
import { resetDatabase } from './utils/database';
import { createUser } from './utils/factories';
import { createTestApp, UUID } from './utils/test-app';
import { resetRateLimits } from './utils/throttler';

@Controller('guard-test')
class GuardTestController {
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Get('staff')
  @Roles(UserRole.Editor, UserRole.Admin)
  staff() {
    return { ok: true };
  }

  @Get('admins')
  @Roles(UserRole.Admin)
  admins() {
    return { ok: true };
  }

  @Public()
  @Get('open')
  open() {
    return { ok: true };
  }

  @OptionalAuth()
  @Get('optional')
  optional(@CurrentUser({ optional: true }) user?: AuthUser) {
    return { user: user ?? null };
  }

  // A bug in a route: @CurrentUser() where nobody has to log in.
  @Public()
  @Get('open-with-current-user')
  broken(@CurrentUser() user: AuthUser) {
    return user;
  }
}

/*
 * The guards as the app runs them: registered globally by AuthModule, in the
 * real HTTP pipeline, with the error shape from AllExceptionsFilter. The
 * token edge cases are in the guards' unit tests.
 */
describe('Auth guards (e2e)', () => {
  let app: INestApplication<App>;
  let accessTokens: AccessTokensService;
  let auth: AuthConfig;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [GuardTestController] });
    accessTokens = app.get(AccessTokensService);
    auth = app.get<AuthConfig>(authConfig.KEY);
  });

  afterAll(async () => {
    await app.close();
  });

  const tokenFor = (role: UserRole) =>
    accessTokens.sign({ id: randomUUID(), role });

  /** Signed with the app's key, expired a second ago. */
  const expiredToken = () => {
    const now = Math.floor(Date.now() / 1000);
    return new JwtService({ secret: auth.accessSecret }).signAsync(
      {
        sub: randomUUID(),
        role: UserRole.Customer,
        iat: now - 60,
        exp: now - 1,
      },
      { issuer: auth.issuer, audience: auth.audience },
    );
  };

  const get = (path: string, token?: string) => {
    const req = request(app.getHttpServer()).get(`/api/guard-test/${path}`);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  describe('authentication', () => {
    it('refuses a call without a token: 401 in the standard error shape', async () => {
      const res = await get('me').expect(401);

      expect(res.body).toEqual({
        error: {
          status: 401,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          requestId: expect.stringMatching(UUID),
        },
      });
      expect(res.headers['www-authenticate']).toBe('Bearer');
    });

    it('refuses an expired token, with the same body', async () => {
      const res = await get('me', await expiredToken()).expect(401);

      expect(res.body.error).toMatchObject({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
      expect(res.headers['www-authenticate']).toBe(
        'Bearer error="invalid_token"',
      );
    });

    it('lets a valid token through; @CurrentUser() is the caller', async () => {
      const user: AuthUser = { id: randomUUID(), role: UserRole.Customer };

      const res = await get('me', await accessTokens.sign(user)).expect(200);

      expect(res.body).toEqual(user);
    });

    it('opens @Public() routes to anyone, ignoring a bad token', async () => {
      await get('open').expect(200);
      await get('open', 'not-a-jwt').expect(200);
    });

    it('@CurrentUser() on a @Public() route is a server bug: generic 500', async () => {
      const res = await get('open-with-current-user').expect(500);

      expect(res.body.error).toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      });
    });

    describe('@OptionalAuth()', () => {
      it('serves a caller without a token as a guest', async () => {
        const res = await get('optional').expect(200);

        expect(res.body).toEqual({ user: null });
      });

      it('knows a caller with a valid token', async () => {
        const user: AuthUser = { id: randomUUID(), role: UserRole.Customer };

        const res = await get('optional', await accessTokens.sign(user)).expect(
          200,
        );

        expect(res.body).toEqual({ user });
      });

      it('refuses an expired token with the usual 401: never a silent guest', async () => {
        const res = await get('optional', await expiredToken()).expect(401);

        expect(res.body.error).toMatchObject({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
        expect(res.headers['www-authenticate']).toBe(
          'Bearer error="invalid_token"',
        );
      });
    });

    it('answers an unknown route with 404, not 401', async () => {
      await request(app.getHttpServer()).get('/api/no-such-route').expect(404);
    });
  });

  describe('roles', () => {
    it.each([
      ['staff', UserRole.Editor],
      ['staff', UserRole.Admin],
      ['admins', UserRole.Admin],
    ])('lets %s through as %s', async (path, role) => {
      await get(path, await tokenFor(role)).expect(200);
    });

    it.each([
      ['staff', UserRole.Customer],
      ['admins', UserRole.Customer],
      ['admins', UserRole.Editor],
    ])('refuses %s to %s: 403 FORBIDDEN', async (path, role) => {
      const res = await get(path, await tokenFor(role)).expect(403);

      expect(res.body.error).toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
        message: 'You are not allowed to do this',
      });
    });

    it('checks the login before the role: no token is 401, not 403', async () => {
      await get('admins').expect(401);
    });

    it('takes the role from the account: real logins as admin and customer', async () => {
      const dataSource = app.get(DataSource);
      await resetDatabase(dataSource);
      resetRateLimits(app);
      const admin = await createUser(dataSource, { role: UserRole.Admin });
      const customer = await createUser(dataSource);

      await get('admins', (await loginAs(app, admin)).accessToken).expect(200);
      await get('admins', (await loginAs(app, customer)).accessToken).expect(
        403,
      );
    });
  });

  // A tripwire next to the feature suites: if a public controller loses its
  // @Public(), this names it.
  it.each([
    '/health',
    '/api/products',
    '/api/products/no-such-product',
    '/api/product-categories',
    '/api/blog-posts',
    '/api/blog-posts/no-such-post',
    '/api/blog-categories',
    '/api/menus/header',
    '/api/pages/no-such-page',
    '/api/settings',
  ])('%s needs no login', async (path) => {
    const res = await request(app.getHttpServer()).get(path);

    expect(res.status).not.toBe(401);
  });
});
