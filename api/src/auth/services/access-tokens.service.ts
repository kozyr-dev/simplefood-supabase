import { Inject, Injectable } from '@nestjs/common';
import { JwtService, type JwtModuleOptions } from '@nestjs/jwt';
import authConfig, { type AuthConfig } from '@/config/auth.config';
import { UserRole } from '@/users/entities/user.entity';
import type { AuthUser } from '../types/auth.types';

/**
 * What an access token carries: the user id and role, nothing personal
 * (a JWT is only encoded, not encrypted: anyone holding it can read it).
 */
export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
}

/**
 * JwtModule options from the auth config. Verification pins the algorithm
 * (no `alg: none`, no switching to another algorithm) and checks `iss`/`aud`.
 */
export function jwtModuleOptions(auth: AuthConfig): JwtModuleOptions {
  return {
    secret: auth.accessSecret,
    signOptions: {
      algorithm: 'HS256',
      expiresIn: auth.accessTtl,
      issuer: auth.issuer,
      audience: auth.audience,
    },
    verifyOptions: {
      algorithms: ['HS256'],
      issuer: auth.issuer,
      audience: auth.audience,
    },
  };
}

const ROLES: readonly string[] = Object.values(UserRole);

/** Short-lived, stateless access tokens (JWT). */
@Injectable()
export class AccessTokensService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(authConfig.KEY) private readonly config: AuthConfig,
  ) {}

  /** Seconds a new access token is valid; responses report it as `expiresIn`. */
  get ttlSeconds(): number {
    return this.config.accessTtl;
  }

  sign(user: AuthUser): Promise<string> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    return this.jwt.signAsync(payload);
  }

  /**
   * The caller, or null for any token that isn't valid right now: malformed,
   * forged, expired, issued for another audience or with an unexpected payload.
   * Callers answer all of them with the same 401.
   */
  async verify(token: string): Promise<AuthUser | null> {
    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync<object>(token);
    } catch {
      return null;
    }
    return toAuthUser(payload);
  }
}

// The signature proves we issued the token, not that its payload has the
// shape this version of the code expects.
function toAuthUser(payload: unknown): AuthUser | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { sub, role } = payload as Partial<Record<'sub' | 'role', unknown>>;
  if (typeof sub !== 'string' || !sub) return null;
  if (typeof role !== 'string' || !ROLES.includes(role)) return null;
  return { id: sub, role: role as UserRole };
}
