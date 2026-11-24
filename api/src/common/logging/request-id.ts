import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { REQUEST_ID_HEADER, SAFE_REQUEST_ID } from './constants';

export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_REQUEST_ID.test(value);
}

/**
 * pino-http's `genReqId`: called once per request, before any route handler.
 * Reuses a safe incoming `X-Request-Id` (so one ID follows the request across
 * nginx, the Next.js server and this API), otherwise generates a UUID.
 * The ID is echoed in the response header, so clients can quote it.
 */
export function genReqId(req: IncomingMessage, res: ServerResponse): string {
  // Node lowercases incoming header names.
  const incoming = req.headers['x-request-id'];
  const id = isValidRequestId(incoming) ? incoming : randomUUID();

  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}
