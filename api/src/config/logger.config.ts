import type { IncomingMessage, ServerResponse } from 'node:http';
import { registerAs } from '@nestjs/config';
import type { Params } from 'nestjs-pino';
import type { LevelWithSilent } from 'pino';
import { genReqId } from '@/common/logging/request-id';
import { SWAGGER_PATH } from './swagger.config';

/** Used when LOG_LEVEL is unset (see config/env.validation.ts). */
const DEFAULT_LEVEL: Record<string, LevelWithSilent> = {
  test: 'silent',
  development: 'debug',
  production: 'info',
};

/**
 * Credentials that must never reach the logs. pino's default request
 * serializer includes all request headers. Brackets are needed for keys
 * with a hyphen.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

/**
 * Logger config under the `logger` namespace, for
 * `LoggerModule.forRootAsync(loggerConfig.asProvider())`.
 *
 * Never add a request-body serializer: bodies carry passwords, addresses
 * and phone numbers.
 */
export default registerAs('logger', (): Params => {
  // Always set (required by the env schema); 'production' is only the safe side.
  const nodeEnv = process.env.NODE_ENV ?? 'production';

  return {
    pinoHttp: {
      level:
        (process.env.LOG_LEVEL as LevelWithSilent | undefined) ??
        DEFAULT_LEVEL[nodeEnv] ??
        'info',

      // Readable single-line logs locally, JSON everywhere else. pino-pretty is
      // a devDependency, so it must never be selected outside development.
      transport:
        nodeEnv === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,

      redact: REDACTED_PATHS,

      // One line per request, at a level matching its outcome.
      customLogLevel: requestLogLevel,

      // No "request completed" line for health probes (every few seconds) and
      // the API docs (one page load = ~7 asset requests): they would drown out
      // real traffic. Logs written *during* those requests still appear.
      autoLogging: { ignore: isUnloggedRequest },

      // Reuses a safe incoming X-Request-Id or generates a UUID, and echoes it
      // in the response header (see common/logging/request-id.ts).
      genReqId,
      // Logs written during a request carry just `reqId`, not the whole request
      // with every header; the "request completed" line still has the full `req`.
      quietReqLogger: true,
    },
  };
});

export function requestLogLevel(
  _req: IncomingMessage,
  res: ServerResponse,
  error?: Error,
): LevelWithSilent {
  if (error || res.statusCode >= 500) return 'error';
  if (res.statusCode >= 400) return 'warn';
  return 'info';
}

const pathOf = (req: IncomingMessage) => req.url?.split('?')[0];

export function isHealthCheck(req: IncomingMessage): boolean {
  return req.method === 'GET' && pathOf(req) === '/health';
}

/** Swagger UI (`/api/docs`), its assets (`/api/docs/*`) and the JSON (`/api/docs-json`). */
export function isApiDocsRequest(req: IncomingMessage): boolean {
  if (req.method !== 'GET') return false;
  const path = pathOf(req);
  const docs = `/${SWAGGER_PATH}`;
  return (
    path === docs ||
    path === `${docs}-json` ||
    (path?.startsWith(`${docs}/`) ?? false)
  );
}

export function isUnloggedRequest(req: IncomingMessage): boolean {
  return isHealthCheck(req) || isApiDocsRequest(req);
}
