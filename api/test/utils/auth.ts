import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { AdminSessionDto } from '@/auth/dto/admin-session.dto';
import type { AuthResultDto } from '@/auth/dto/auth-result.dto';
import { ADMIN_REFRESH_COOKIE } from '@/auth/types/auth.types';
import type { User } from '@/users/entities/user.entity';
import { TEST_PASSWORD } from './factories';

/**
 * Logs `user` in through `POST /api/auth/login` and returns the response's
 * `data`: `const { accessToken } = await loginAs(app, user)`.
 */
export async function loginAs(
  app: INestApplication<App>,
  user: Pick<User, 'email'>,
  password = TEST_PASSWORD,
): Promise<AuthResultDto> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email: user.email, password })
    .expect(200);
  return (res.body as { data: AuthResultDto }).data;
}

export const bearer = (token: string) => ({
  Authorization: `Bearer ${token}`,
});

/**
 * Headers that make a request look sent from a page on the API's own host,
 * as the admin app's are (SameOriginGuard compares `Origin` with `Host`).
 */
export const SAME_ORIGIN = {
  Host: 'admin.test',
  Origin: 'http://admin.test',
} as const;

/** The admin app's refresh cookie, parsed from a response's `Set-Cookie`. */
export interface AdminRefreshCookie {
  /** The token; '' when the response deletes the cookie. */
  value: string;
  /** `Path=/api/admin/auth`, `HttpOnly`, ... */
  attributes: string[];
  /** To send it back: `.set('Cookie', cookie.header)`. */
  header: string;
}

/** The `sf_admin_refresh` cookie a response sets or deletes, if any. */
export function adminRefreshCookie(
  res: request.Response,
): AdminRefreshCookie | undefined {
  const headers = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = headers.find((header) =>
    header.startsWith(`${ADMIN_REFRESH_COOKIE}=`),
  );
  if (!cookie) return undefined;
  const [pair, ...attributes] = cookie.split('; ');
  return {
    value: pair.slice(ADMIN_REFRESH_COOKIE.length + 1),
    attributes,
    header: pair,
  };
}

/**
 * Logs a staff member in through the admin app's login and returns the
 * session and the refresh cookie (send it back with `.set('Cookie', ...)`).
 */
export async function adminLoginAs(
  app: INestApplication<App>,
  user: Pick<User, 'email'>,
  password = TEST_PASSWORD,
): Promise<{ session: AdminSessionDto; cookie: AdminRefreshCookie }> {
  const res = await request(app.getHttpServer())
    .post('/api/admin/auth/login')
    .set(SAME_ORIGIN)
    .send({ email: user.email, password })
    .expect(200);
  return {
    session: (res.body as { data: AdminSessionDto }).data,
    cookie: adminRefreshCookie(res) as AdminRefreshCookie,
  };
}
