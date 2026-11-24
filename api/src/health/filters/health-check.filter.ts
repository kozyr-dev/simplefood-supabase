import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

/** Shown instead of the real error of a failed check. */
export const HEALTH_FAILURE_MESSAGE = 'unavailable';

/**
 * Terminus reports a failed check by throwing ServiceUnavailableException
 * with its own body (`{ status: 'error', info, error, details }`). Monitoring
 * tools expect that format, so it's kept instead of being rewritten by the
 * global AllExceptionsFilter (controller-scoped filters run before global ones).
 *
 * But each failed indicator's `message` is the raw error, e.g. Postgres's
 * `password authentication failed for user "…"` or an internal host name, and
 * /health is public. So messages are replaced with a generic one. The full
 * details are still logged: Terminus logs "Health Check has failed!" with
 * them before throwing.
 */
@Catch(ServiceUnavailableException)
export class HealthCheckFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: ServiceUnavailableException, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    httpAdapter.reply(
      host.switchToHttp().getResponse(),
      redactHealthMessages(exception.getResponse()),
      exception.getStatus(),
    );
  }
}

type IndicatorResults = Record<string, Record<string, unknown>>;

/** Replaces `message` in every indicator under `error` and `details`. */
export function redactHealthMessages(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return body;
  const result = { ...(body as Record<string, unknown>) };

  for (const section of ['error', 'details'] as const) {
    const indicators = result[section] as IndicatorResults | undefined;
    if (typeof indicators !== 'object' || indicators === null) continue;

    result[section] = Object.fromEntries(
      Object.entries(indicators).map(([key, indicator]) => [
        key,
        'message' in indicator
          ? { ...indicator, message: HEALTH_FAILURE_MESSAGE }
          : indicator,
      ]),
    );
  }
  return result;
}
