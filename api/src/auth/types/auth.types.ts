import type { IncomingMessage } from 'node:http';
import type { UserRole } from '@/users/entities/user.entity';

/**
 * Who is calling: read from a valid access token, without a database query.
 * `role` is the role when the token was issued (at most JWT_ACCESS_TTL ago).
 */
export interface AuthUser {
  id: string;
  role: UserRole;
}

/** A request after JwtAuthGuard: `user` is set on every non-public route. */
export type AuthRequest = IncomingMessage & { user?: AuthUser };

/** The cookie holding the admin app's refresh token (AdminAuthController). */
export const ADMIN_REFRESH_COOKIE = 'sf_admin_refresh';

/**
 * The cookie's path: the global `api` prefix plus AdminAuthController's
 * path, so only its three routes ever receive the refresh token.
 */
export const ADMIN_REFRESH_COOKIE_PATH = '/api/admin/auth';

/** The Swagger security scheme describing that cookie (swagger.config.ts). */
export const ADMIN_REFRESH_SECURITY = 'adminRefreshCookie';
