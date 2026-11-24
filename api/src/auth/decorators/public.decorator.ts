import { Reflector } from '@nestjs/core';

/** Metadata read by JwtAuthGuard; use `@Public()` instead. */
export const IsPublic = Reflector.createDecorator<boolean>();

/**
 * Opens a route (or every route of a controller) to anonymous callers.
 * Every other route needs a valid access token: the guard is global, so a
 * route nobody thought about is closed, not open.
 */
export const Public = () => IsPublic(true);
