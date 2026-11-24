import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequiredRoles } from '../decorators/roles.decorator';
import type { AuthRequest } from '../types/auth.types';

/**
 * Global, after JwtAuthGuard: enforces `@Roles(...)`. Routes without it are
 * open to any logged-in user. The role comes from the access token, so a
 * changed role applies within JWT_ACCESS_TTL.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride(RequiredRoles, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles) {
      return true;
    }

    // No user means @Roles() on a @Public() route: refuse rather than guess.
    const { user } = context.switchToHttp().getRequest<AuthRequest>();
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException('You are not allowed to do this');
    }
    return true;
  }
}
