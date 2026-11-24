import type { IncomingMessage } from 'node:http';
import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';

/** Methods that change nothing: no check needed. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** A `Host` header: a name or IPv4 address, or an [IPv6] one, and a port. */
const HOST = /^(?:[a-z\d.-]+|\[[\da-f:.]+\])(?::\d{1,5})?$/i;

/**
 * Whether `origin` (an `Origin` header) names the host the request was sent
 * to (its `Host` header). Default ports count as equal (`:443` on https).
 */
export function isSameOrigin(
  origin: string | undefined,
  host: string | undefined,
): boolean {
  // URL() would quietly drop a path or `user@` in the Host header.
  if (!origin || !host || !HOST.test(host)) {
    return false;
  }
  try {
    const from = new URL(origin);
    if (from.protocol !== 'http:' && from.protocol !== 'https:') {
      return false;
    }
    return from.host === new URL(`${from.protocol}//${host}`).host;
  } catch {
    // `Origin: null` (sandboxed pages, some redirects) and garbage.
    return false;
  }
}

/**
 * For routes that act on a cookie (the admin app's refresh token): a
 * request that changes something must come from a page on the API's own
 * host. Browsers always send `Origin` with such requests, and a page can't
 * forge it.
 *
 * The cookie is `SameSite=Strict` already; this also stops the sites that
 * count as the "same site" (any `*.kozyr.info` page), and older browsers.
 * The scheme isn't compared: behind a TLS proxy the API itself may see
 * http, and an http page on the same host is the same server anyway.
 */
@Injectable()
export class SameOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<IncomingMessage>();
    if (SAFE_METHODS.has(request.method ?? '')) {
      return true;
    }
    if (!isSameOrigin(request.headers.origin, request.headers.host)) {
      throw new ForbiddenException({
        message: 'Requests from other sites are not allowed here',
        code: 'CROSS_ORIGIN_REQUEST',
      });
    }
    return true;
  }
}
