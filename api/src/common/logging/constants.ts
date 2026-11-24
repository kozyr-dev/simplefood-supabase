export const REQUEST_ID_HEADER = 'X-Request-Id';

/**
 * Letters, digits and dashes, at most 64 chars: fits UUIDs (36) and nginx's
 * `$request_id` (32 hex). Rejects anything that could forge or bloat log
 * lines (quotes, braces, newlines), plus duplicate headers, which Node joins
 * into one value with ", ".
 */
export const SAFE_REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/;
