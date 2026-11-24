import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { genReqId } from '../logging/request-id';

/** The one error shape every endpoint returns. */
export interface ErrorResponseBody {
  error: {
    status: number;
    /** Machine-readable: `NOT_FOUND`, `BAD_REQUEST`, or a custom code such as `EMAIL_TAKEN`. */
    code: string;
    message: string;
    /** Same as the `X-Request-Id` response header; lets users quote the request when reporting a problem. */
    requestId: string;
    /** Per-field problems; only present for validation errors. */
    details?: unknown[];
    /** Set when `details` was capped. */
    truncated?: true;
  };
}

type ErrorPayload = Omit<ErrorResponseBody['error'], 'requestId'>;

/**
 * Catches everything (`@Catch()` with no arguments) and replies with
 * ErrorResponseBody. Unexpected errors become a generic 500: their message
 * may contain SQL, values or file paths, so it is logged, never sent.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    // Resolved here, not in the constructor: the adapter may not exist yet then.
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<IncomingMessage>();
    const response = ctx.getResponse<ServerResponse>();
    const payload = this.toPayload(exception);
    const { status } = payload;
    const route = `${httpAdapter.getRequestMethod(request)} ${httpAdapter.getRequestUrl(request)} -> ${status}`;

    // pino-http sets `request.id`. It's missing when the request failed before
    // that middleware ran (body parsing, malformed URL): give it an ID now (this
    // also sets the X-Request-Id header) and log it here, since pino-http won't.
    // (Our genReqId always returns a string; pino-http types the ID more loosely.)
    const seenByPinoHttp = request.id !== undefined;
    const requestId =
      typeof request.id === 'string' ? request.id : genReqId(request, response);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        route,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else if (!seenByPinoHttp) {
      this.logger.warn(
        `${route} (rejected before routing, reqId=${requestId})`,
      );
    }

    const body: ErrorResponseBody = { error: { ...payload, requestId } };
    httpAdapter.reply(response, body, status);
  }

  private toPayload(exception: unknown): ErrorPayload {
    // Nest's Express adapter (12.3+) wraps the body parser's errors in an
    // HttpException with the original as `cause`; earlier ones passed it raw.
    const bodyParserError = this.fromBodyParserError(
      exception instanceof HttpException ? exception.cause : exception,
    );
    if (bodyParserError) {
      return bodyParserError;
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    return error(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error');
  }

  private fromHttpException(exception: HttpException): ErrorPayload {
    const status = exception.getStatus();
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return error(status, response);
    }

    const { message, code, details, truncated } = response as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      truncated?: unknown;
    };

    return error(
      status,
      typeof message === 'string'
        ? message
        : Array.isArray(message)
          ? message.join('; ')
          : exception.message,
      {
        code: typeof code === 'string' ? code : undefined,
        details: Array.isArray(details) && details.length ? details : undefined,
        truncated: truncated === true || undefined,
      },
    );
  }

  /**
   * Express's body parser fails before Nest's routing. Malformed JSON is a
   * SyntaxError, which Nest's Express adapter turns into a plain
   * BadRequestException. Its other errors have a 4xx `status` and a `type`
   * (`entity.too.large`, `charset.unsupported`, `encoding.unsupported`, ...);
   * they get our own message, not the parser's wording.
   */
  private fromBodyParserError(exception: unknown): ErrorPayload | null {
    if (typeof exception !== 'object' || exception === null) return null;

    const { status, type } = exception as { status?: unknown; type?: unknown };
    if (typeof status !== 'number' || status < 400 || status >= 500)
      return null;
    if (typeof type !== 'string') return null;

    return error(
      status,
      type === 'entity.too.large'
        ? 'Request body too large'
        : 'Invalid request body',
    );
  }
}

function error(
  status: number,
  message: string,
  extra: { code?: string; details?: unknown[]; truncated?: true } = {},
): ErrorPayload {
  return {
    status,
    code: extra.code ?? HttpStatus[status] ?? 'ERROR',
    message,
    ...(extra.details && { details: extra.details }),
    ...(extra.truncated && { truncated: true as const }),
  };
}
