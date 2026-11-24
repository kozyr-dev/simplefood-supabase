import { Reflector } from '@nestjs/core';

/**
 * For AuthThrottlerGuard: the request-body field that, together with the IP,
 * says whom an anonymous request counts against on this route, e.g.
 * `@ThrottleBy('email')` on login. The value is trimmed and lowercased,
 * as the lookups do. Without it, anonymous requests count by IP alone.
 *
 * Only for a field naming the account or address the route acts on, where
 * a fresh value buys nothing. Never on register: a new email per request
 * would give each one a fresh limit.
 */
export const ThrottleBy = Reflector.createDecorator<string>();
