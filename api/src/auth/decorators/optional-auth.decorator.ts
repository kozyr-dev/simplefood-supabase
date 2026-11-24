import { Reflector } from '@nestjs/core';

/** Metadata read by JwtAuthGuard; use `@OptionalAuth()` instead. */
export const IsOptionalAuth = Reflector.createDecorator<boolean>();

/**
 * Opens a route to anonymous callers, but still checks a token that is sent:
 * - no `Authorization` header: a guest, no `request.user`;
 * - a valid token: `request.user`, as on any other route;
 * - a bad or expired token: 401, as on any other route, so the client
 *   refreshes and retries instead of silently carrying on as a guest.
 *
 * Read the caller with `@CurrentUser({ optional: true })`.
 */
export const OptionalAuth = () => IsOptionalAuth(true);
