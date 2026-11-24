import { Reflector } from '@nestjs/core';
import type { UserRole } from '@/users/entities/user.entity';

/** Metadata read by RolesGuard; use `@Roles(...)` instead. */
export const RequiredRoles = Reflector.createDecorator<UserRole[]>();

/**
 * Limits a route (or a controller) to callers with one of these roles; a
 * method's `@Roles()` replaces its controller's. At least one role: an empty
 * list would lock everyone out.
 */
export const Roles = (role: UserRole, ...more: UserRole[]) =>
  RequiredRoles([role, ...more]);
