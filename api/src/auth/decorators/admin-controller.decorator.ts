import { applyDecorators, Controller, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiAuth } from '@/common/http/api-responses.decorator';
import { STAFF_ROLES, type UserRole } from '@/users/entities/user.entity';
import { AdminInterceptor } from '../interceptors/admin.interceptor';
import { Roles } from './roles.decorator';

/**
 * A controller of the admin API: `/api/admin/<path>`, for staff only (or
 * the roles given), documented under the `admin` tag, never cached, and
 * every write in the audit log (AdminInterceptor). A method's `@Roles()`
 * narrows it further, e.g. deleting to admins.
 */
export function AdminController(
  path: string,
  roles: readonly UserRole[] = STAFF_ROLES,
) {
  const [role, ...more] = roles;
  return applyDecorators(
    Controller(`admin/${path}`),
    Roles(role, ...more),
    ApiTags('admin'),
    ApiAuth({ roles }),
    UseInterceptors(AdminInterceptor),
  );
}
