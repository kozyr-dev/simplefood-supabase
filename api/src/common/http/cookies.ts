/*
 * Reading and writing one cookie by hand: the API sets a single cookie (the
 * admin app's refresh token), which doesn't justify cookie-parser. Values
 * are written as they are, so they must be cookie-safe (base64url tokens
 * are); nothing is URL-encoded or decoded.
 */

export interface CookieOptions {
  /** Only requests under this path carry the cookie. */
  path: string;
  /** When the browser drops it; omitted, it lasts until the browser closes. */
  expires?: Date;
  /** Hidden from page scripts (`document.cookie`). */
  httpOnly?: boolean;
  /** Sent over HTTPS only. */
  secure?: boolean;
  /** `Strict`: never sent with a request started by another site. */
  sameSite?: 'Strict' | 'Lax';
}

/** RFC 6265 `token` (names) and `cookie-octet`s (values), stricter than needed. */
const NAME = /^[\w!#$%&'*+.^`|~-]+$/;
const VALUE = /^[\w!#$%&'()*+./:<=>?@[\]^`{|}~-]*$/;

/** A `Set-Cookie` header value. Throws for a name or value that needs escaping. */
export function serializeCookie(
  name: string,
  value: string,
  { path, expires, httpOnly, secure, sameSite }: CookieOptions,
): string {
  if (!NAME.test(name) || !VALUE.test(value)) {
    throw new Error(`Cookie "${name}" has characters that need escaping`);
  }
  const parts = [`${name}=${value}`, `Path=${path}`];
  if (expires) {
    // Both: Max-Age wins where supported, Expires covers the rest.
    const seconds = Math.max(
      0,
      Math.floor((expires.getTime() - Date.now()) / 1000),
    );
    parts.push(`Expires=${expires.toUTCString()}`, `Max-Age=${seconds}`);
  }
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (sameSite) parts.push(`SameSite=${sameSite}`);
  return parts.join('; ');
}

/** A `Set-Cookie` header value that makes the browser delete the cookie. */
export function expiredCookie(
  name: string,
  options: Omit<CookieOptions, 'expires'>,
): string {
  return serializeCookie(name, '', { ...options, expires: new Date(0) });
}

/**
 * The value of cookie `name` in a `Cookie` request header, or undefined.
 * With duplicates (same name, different paths), the first one: browsers
 * send the most specific path first.
 */
export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  for (const pair of header?.split(';') ?? []) {
    const separator = pair.indexOf('=');
    if (separator > 0 && pair.slice(0, separator).trim() === name) {
      return pair.slice(separator + 1).trim();
    }
  }
  return undefined;
}
