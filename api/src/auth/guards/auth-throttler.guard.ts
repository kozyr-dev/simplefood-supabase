import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ThrottleBy } from '../decorators/throttle-by.decorator';
import type { AuthRequest } from '../types/auth.types';

type ThrottledRequest = AuthRequest & { ip?: string; body?: unknown };

/**
 * Rate limits for routes that check a password, create accounts or send
 * mail. Not global: every server-rendered page reaches the API from
 * the Next server's one IP, so a global per-IP limit would take the whole
 * site down. Apply it with `@UseGuards(AuthThrottlerGuard)` and set the
 * limits with `@Throttle()`. Counters live in memory, per process: use a
 * shared store (Redis) before running more than one instance.
 *
 * Who a request counts against:
 * - a logged-in caller: their account, from any IP, so a stolen access token
 *   can't spread password guesses over many addresses;
 * - with `@ThrottleBy(field)`: the IP and that body field, e.g. login's
 *   `email`, so one client failing logins can't lock everyone behind
 *   the same IP out, and the emails one address receives stay capped;
 * - otherwise: the IP.
 */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  // The base class calls this with the context too, but doesn't declare it.
  protected override async getTracker(
    req: ThrottledRequest,
    context?: ExecutionContext,
  ): Promise<string> {
    if (req.user) {
      return `user:${req.user.id}`;
    }
    // The base tracker: req.ip, with IPv6 reduced to its /64 network.
    const ip = await super.getTracker(req);
    const field =
      context &&
      this.reflector.getAllAndOverride(ThrottleBy, [
        context.getHandler(),
        context.getClass(),
      ]);
    if (!field) {
      return ip;
    }
    // Runs before the pipes: the body is raw JSON, so normalise it the way
    // the lookup does (trimmed, case-insensitive).
    const value = (req.body as Record<string, unknown> | undefined)?.[field];
    return typeof value === 'string'
      ? `${ip}|${value.trim().toLowerCase()}`
      : ip;
  }
}
