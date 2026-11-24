import { JwtService } from '@nestjs/jwt';
import type { AuthConfig } from '@/config/auth.config';
import { UserRole } from '@/users/entities/user.entity';
import type { AuthUser } from '../types/auth.types';
import { AccessTokensService, jwtModuleOptions } from './access-tokens.service';

const config = {
  accessSecret: 'unit-test-secret-unit-test-secret-0',
  accessTtl: 900,
  issuer: 'simplefood-api',
  audience: 'simplefood',
} as AuthConfig;

const user: AuthUser = {
  id: '019a1b2c-3d4e-7f50-8a6b-7c8d9e0f1a2b',
  role: UserRole.Customer,
};

/** Signs whatever a test needs, with the real secret unless told otherwise. */
const forger = new JwtService({ secret: config.accessSecret });
const forge = (payload: object, options: Parameters<JwtService['sign']>[1]) =>
  forger.signAsync(payload, {
    algorithm: 'HS256',
    issuer: config.issuer,
    audience: config.audience,
    expiresIn: 60,
    ...options,
  });

const base64url = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

/** The payload part of a JWT, decoded without checking anything. */
const decode = (token: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

describe('AccessTokensService', () => {
  const service = new AccessTokensService(
    new JwtService(jwtModuleOptions(config)),
    config,
  );

  it('signs a token that verifies back to the same user', async () => {
    const token = await service.sign(user);

    expect(await service.verify(token)).toEqual(user);
  });

  it('carries only the id, role and standard claims (nothing personal)', async () => {
    const token = await service.sign({
      ...user,
      email: 'ivan@example.com',
    } as AuthUser);
    const payload = decode(token);

    expect(Object.keys(payload).sort()).toEqual(
      ['aud', 'exp', 'iat', 'iss', 'role', 'sub'].sort(),
    );
    expect(payload).toMatchObject({
      sub: user.id,
      role: 'customer',
      iss: 'simplefood-api',
      aud: 'simplefood',
    });
    expect(Number(payload.exp) - Number(payload.iat)).toBe(900);
  });

  it('uses HS256', async () => {
    const header = JSON.parse(
      Buffer.from(
        (await service.sign(user)).split('.')[0],
        'base64url',
      ).toString(),
    );

    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
  });

  it('reports the lifetime as ttlSeconds', () => {
    expect(service.ttlSeconds).toBe(900);
  });

  it.each(Object.values(UserRole))('accepts the role %s', async (role) => {
    expect(await service.verify(await service.sign({ ...user, role }))).toEqual(
      { ...user, role },
    );
  });

  describe('rejects (returns null)', () => {
    const payload = { sub: user.id, role: user.role };

    it.each([
      ['an empty string', ''],
      ['garbage', 'not-a-jwt'],
      ['three garbage parts', 'a.b.c'],
    ])('%s', async (_, token) => {
      expect(await service.verify(token)).toBeNull();
    });

    it('an expired token', async () => {
      const exp = Math.floor(Date.now() / 1000) - 1;
      const token = await forger.signAsync(
        { ...payload, exp },
        { issuer: config.issuer, audience: config.audience },
      );

      expect(await service.verify(token)).toBeNull();
    });

    it('a token signed with another secret', async () => {
      const token = await forge(payload, {
        secret: 'another-secret-another-secret-00000',
      });

      expect(await service.verify(token)).toBeNull();
    });

    it.each([
      ['another issuer', { issuer: 'someone-else' }],
      ['another audience', { audience: 'admin-panel' }],
    ])('a token for %s', async (_, options) => {
      expect(await service.verify(await forge(payload, options))).toBeNull();
    });

    it('another algorithm, even with the right secret (HS512)', async () => {
      const token = await forge(payload, { algorithm: 'HS512' });

      expect(await service.verify(token)).toBeNull();
    });

    it('an unsigned token (alg: none)', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({
        ...payload,
        role: UserRole.Admin,
        iss: config.issuer,
        aud: config.audience,
        iat: now,
        exp: now + 60,
      })}.`;

      expect(await service.verify(token)).toBeNull();
    });

    it('a token whose payload was changed after signing', async () => {
      const [header, , signature] = (await service.sign(user)).split('.');
      const tampered = `${header}.${base64url({
        ...decode(await service.sign(user)),
        role: UserRole.Admin,
      })}.${signature}`;

      expect(await service.verify(tampered)).toBeNull();
    });

    it.each([
      ['no sub', { role: 'customer' }],
      ['an empty sub', { sub: '', role: 'customer' }],
      ['a numeric sub', { sub: 42, role: 'customer' }],
      ['no role', { sub: user.id }],
      ['an unknown role', { sub: user.id, role: 'superuser' }],
    ])('a correctly signed token with %s', async (_, claims) => {
      expect(await service.verify(await forge(claims, {}))).toBeNull();
    });
  });
});
