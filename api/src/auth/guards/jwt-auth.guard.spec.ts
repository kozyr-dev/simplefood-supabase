import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { JwtService } from '@nestjs/jwt';
import type { AuthConfig } from '@/config/auth.config';
import { UserRole } from '@/users/entities/user.entity';
import { OptionalAuth } from '../decorators/optional-auth.decorator';
import { Public } from '../decorators/public.decorator';
import {
  AccessTokensService,
  jwtModuleOptions,
} from '../services/access-tokens.service';
import type { AuthRequest, AuthUser } from '../types/auth.types';
import { JwtAuthGuard } from './jwt-auth.guard';

const config = {
  accessSecret: 'unit-test-secret-unit-test-secret-0',
  accessTtl: 900,
  issuer: 'simplefood-api',
  audience: 'simplefood',
} as AuthConfig;

const user: AuthUser = {
  id: '019a1b2c-3d4e-7f50-8a6b-7c8d9e0f1a2b',
  role: UserRole.Editor,
};

class PrivateController {
  closed(this: void) {}

  @Public()
  open(this: void) {}
}

@Public()
class PublicController {
  open(this: void) {}
}

class OptionalController {
  @OptionalAuth()
  maybe(this: void) {}
}

/** A request to `handler` of `controller`, as Nest hands it to guards. */
function call(
  controller: abstract new () => object,
  handler: () => void,
  authorization?: string,
) {
  const request = {
    headers: authorization === undefined ? {} : { authorization },
  } as AuthRequest;
  const response = { setHeader: jest.fn() };
  const context = new ExecutionContextHost(
    [request, response],
    controller as never,
    handler,
  );
  return { context, request, response };
}

describe('JwtAuthGuard', () => {
  const accessTokens = new AccessTokensService(
    new JwtService(jwtModuleOptions(config)),
    config,
  );
  const guard = new JwtAuthGuard(new Reflector(), accessTokens);
  let token: string;

  beforeAll(async () => {
    token = await accessTokens.sign(user);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** Runs the guard, expecting the 401; returns the WWW-Authenticate value. */
  async function expectUnauthorized(authorization?: string): Promise<string> {
    const { context, request, response } = call(
      PrivateController,
      PrivateController.prototype.closed,
      authorization,
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Authentication required'),
    );
    expect(request.user).toBeUndefined();
    expect(response.setHeader).toHaveBeenCalledTimes(1);
    const [name, value] = response.setHeader.mock.calls[0] as [string, string];
    expect(name).toBe('WWW-Authenticate');
    return value;
  }

  describe('public routes', () => {
    it.each([
      [
        'a @Public() method',
        PrivateController,
        PrivateController.prototype.open,
      ],
      [
        'a method of a @Public() controller',
        PublicController,
        PublicController.prototype.open,
      ],
    ])(
      'lets anyone call %s, without reading the token',
      async (_, cls, handler) => {
        const verify = jest.spyOn(accessTokens, 'verify');
        const { context, request } = call(cls, handler, 'Bearer garbage');

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(verify).not.toHaveBeenCalled();
        expect(request.user).toBeUndefined();
      },
    );
  });

  describe('other routes', () => {
    it('accepts a valid token and sets request.user', async () => {
      const { context, request } = call(
        PrivateController,
        PrivateController.prototype.closed,
        `Bearer ${token}`,
      );

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toEqual(user);
    });

    it('accepts the scheme in any case (RFC 7235)', async () => {
      const { context, request } = call(
        PrivateController,
        PrivateController.prototype.closed,
        `bearer ${token}`,
      );

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toEqual(user);
    });

    it.each([
      ['no Authorization header', undefined],
      ['an empty header', ''],
      ['another scheme', `Basic ${Buffer.from('a:b').toString('base64')}`],
      ['the token without a scheme', 'TOKEN'],
      ['the scheme without a token', 'Bearer'],
      ['the scheme and a space', 'Bearer '],
      ['two tokens', 'Bearer a.b.c d.e.f'],
      ['characters a token never has', 'Bearer a.b.c;'],
    ])('refuses %s (WWW-Authenticate: Bearer)', async (_, authorization) => {
      expect(
        await expectUnauthorized(authorization?.replace('TOKEN', token)),
      ).toBe('Bearer');
    });

    it.each([
      ['garbage', 'not-a-jwt'],
      [
        'a token signed with another secret',
        () =>
          new JwtService({
            secret: 'another-secret-another-secret-00000',
          }).signAsync(
            { sub: user.id, role: UserRole.Admin },
            { issuer: config.issuer, audience: config.audience },
          ),
      ],
      [
        'an unsigned token (alg: none)',
        () =>
          Promise.resolve(
            [
              { alg: 'none', typ: 'JWT' },
              {
                sub: user.id,
                role: UserRole.Admin,
                iss: config.issuer,
                aud: config.audience,
                exp: Math.floor(Date.now() / 1000) + 60,
              },
            ]
              .map((part) =>
                Buffer.from(JSON.stringify(part)).toString('base64url'),
              )
              .join('.') + '.',
          ),
      ],
    ])(
      'refuses %s (WWW-Authenticate: Bearer error="invalid_token")',
      async (_, make) => {
        const bad = typeof make === 'string' ? make : await make();

        expect(await expectUnauthorized(`Bearer ${bad}`)).toBe(
          'Bearer error="invalid_token"',
        );
      },
    );
  });
  describe('@OptionalAuth() routes', () => {
    const callOptional = (authorization?: string) =>
      call(
        OptionalController,
        OptionalController.prototype.maybe,
        authorization,
      );

    it('lets a caller without a header in as a guest', async () => {
      const verify = jest.spyOn(accessTokens, 'verify');
      const { context, request } = callOptional();

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toBeUndefined();
      expect(verify).not.toHaveBeenCalled();
    });

    it('reads a valid token: request.user is the caller', async () => {
      const { context, request } = callOptional(`Bearer ${token}`);

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toEqual(user);
    });

    it.each([
      ['garbage', 'Bearer not-a-jwt', 'Bearer error="invalid_token"'],
      ['another scheme', 'Basic YTpi', 'Bearer'],
      ['an empty header', '', 'Bearer'],
    ])(
      'refuses %s with 401, not a silent guest',
      async (_, authorization, challenge) => {
        const { context, request, response } = callOptional(authorization);

        await expect(guard.canActivate(context)).rejects.toThrow(
          UnauthorizedException,
        );
        expect(request.user).toBeUndefined();
        expect(response.setHeader).toHaveBeenCalledWith(
          'WWW-Authenticate',
          challenge,
        );
      },
    );
  });
});
