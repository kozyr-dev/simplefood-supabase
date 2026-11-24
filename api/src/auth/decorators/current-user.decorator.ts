import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthRequest, AuthUser } from '../types/auth.types';

export interface CurrentUserOptions {
  /** On an `@OptionalAuth()` route: `undefined` for a guest, not an error. */
  optional?: boolean;
}

/**
 * The caller, as JwtAuthGuard read it from the access token. Only on routes
 * that need a login: on a `@Public()` route there is no user, and that's a
 * bug in the route (500), not something the client did. On an
 * `@OptionalAuth()` route, use `@CurrentUser({ optional: true })`.
 */
export const CurrentUser = createParamDecorator(
  (
    options: CurrentUserOptions | undefined,
    context: ExecutionContext,
  ): AuthUser | undefined => {
    const { user } = context.switchToHttp().getRequest<AuthRequest>();
    if (!user && !options?.optional) {
      throw new Error(
        '@CurrentUser() on a route without an authenticated user (is it @Public()?)',
      );
    }
    return user;
  },
);
