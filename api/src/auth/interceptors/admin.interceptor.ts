import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { tap, type Observable } from 'rxjs';
import type { AuthRequest } from '../types/auth.types';

/** Methods that change something: each one is written to the audit log. */
const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type AdminRequest = AuthRequest & {
  route?: { path?: string };
  params?: Record<string, string>;
};

/**
 * On every admin route (`@AdminController()`):
 * - `Cache-Control: no-store`: the answers hold orders, accounts and
 *   unpublished content;
 * - one `Admin action` line per successful write: who (account id), what
 *   (method and route pattern) and which record. Never a body or a value:
 *   they hold names, phones and addresses.
 */
@Injectable()
export class AdminInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AdminAudit');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<AdminRequest>();
    http.getResponse<ServerResponse>().setHeader('Cache-Control', 'no-store');

    if (!WRITES.has((request as IncomingMessage).method ?? '')) {
      return next.handle();
    }
    return next.handle().pipe(
      tap((body: unknown) => {
        const created = (body as { data?: { id?: unknown } } | undefined)?.data
          ?.id;
        this.logger.log({
          msg: 'Admin action',
          adminId: request.user?.id,
          method: request.method,
          // The pattern (`/api/admin/products/:id`), not the URL.
          route: request.route?.path,
          recordId:
            request.params?.id ??
            (typeof created === 'string' || typeof created === 'number'
              ? created
              : undefined),
        });
      }),
    );
  }
}
