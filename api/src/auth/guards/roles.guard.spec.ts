import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { UserRole } from '@/users/entities/user.entity';
import { Roles } from '../decorators/roles.decorator';
import type { AuthRequest } from '../types/auth.types';
import { RolesGuard } from './roles.guard';

class AnyUserController {
  anyone(this: void) {}

  @Roles(UserRole.Admin)
  admins(this: void) {}

  @Roles(UserRole.Editor, UserRole.Admin)
  staff(this: void) {}
}

@Roles(UserRole.Editor)
class EditorsController {
  editors(this: void) {}

  // A method's @Roles() replaces the controller's.
  @Roles(UserRole.Admin)
  admins(this: void) {}
}

const { Customer, Editor, Admin } = UserRole;

function canActivate(
  controller: abstract new () => object,
  handler: () => void,
  role?: UserRole,
): boolean {
  const request = {
    headers: {},
    user: role && { id: '019a1b2c-3d4e-7f50-8a6b-7c8d9e0f1a2b', role },
  } as AuthRequest;
  return new RolesGuard(new Reflector()).canActivate(
    new ExecutionContextHost([request, {}], controller as never, handler),
  );
}

describe('RolesGuard', () => {
  const routes = {
    anyone: [AnyUserController, AnyUserController.prototype.anyone],
    admins: [AnyUserController, AnyUserController.prototype.admins],
    staff: [AnyUserController, AnyUserController.prototype.staff],
    editors: [EditorsController, EditorsController.prototype.editors],
    'admins (overrides the controller)': [
      EditorsController,
      EditorsController.prototype.admins,
    ],
  } as const;

  it.each([
    ['anyone', Customer],
    ['anyone', undefined], // a @Public() route: nothing to check
    ['admins', Admin],
    ['staff', Editor],
    ['staff', Admin],
    ['editors', Editor],
    ['admins (overrides the controller)', Admin],
  ] as const)('lets %s through as %s', (route, role) => {
    const [cls, handler] = routes[route];

    expect(canActivate(cls, handler, role)).toBe(true);
  });

  it.each([
    ['admins', Customer],
    ['admins', Editor],
    ['staff', Customer],
    ['editors', Customer],
    ['editors', Admin], // roles are a list, not a ladder
    ['admins (overrides the controller)', Editor],
    ['admins', undefined], // @Roles() on a @Public() route
  ] as const)('refuses %s to %s (403)', (route, role) => {
    const [cls, handler] = routes[route];

    expect(() => canActivate(cls, handler, role)).toThrow(
      new ForbiddenException('You are not allowed to do this'),
    );
  });
});
