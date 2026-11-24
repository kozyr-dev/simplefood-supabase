import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ServerResponse } from 'node:http';
import { IsOptionalAuth } from '../decorators/optional-auth.decorator';
import { IsPublic } from '../decorators/public.decorator';
import { AccessTokensService } from '../services/access-tokens.service';
import type { AuthRequest } from '../types/auth.types';

// RFC 6750 §2.1: scheme is case-insensitive, the token is base64url-ish
// characters (a JWT's three parts and dots fit).
const BEARER = /^Bearer +([\w.~+/-]+=*) *$/i;

/**
 * Global: every route needs `Authorization: Bearer <access token>` unless it
 * is `@Public()`, or `@OptionalAuth()` and sent without the header. Sets
 * `request.user`. Missing, malformed, forged and expired tokens all get the
 * same 401, so the client only needs one rule: refresh, then retry once.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokensService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride(IsPublic, targets)) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<AuthRequest>();
    const { authorization } = request.headers;
    // A guest on an @OptionalAuth() route. A header that is sent, even an
    // empty one, is checked below like on any other route.
    if (
      authorization === undefined &&
      this.reflector.getAllAndOverride(IsOptionalAuth, targets)
    ) {
      return true;
    }

    const token = BEARER.exec(authorization ?? '')?.[1];
    const user = token ? await this.accessTokens.verify(token) : null;
    if (!user) {
      // RFC 6750 §3: a 401 from a bearer-token API names the scheme.
      http
        .getResponse<ServerResponse>()
        .setHeader(
          'WWW-Authenticate',
          token ? 'Bearer error="invalid_token"' : 'Bearer',
        );
      throw new UnauthorizedException('Authentication required');
    }

    request.user = user;
    return true;
  }
}
