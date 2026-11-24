import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { UserRole } from '@/users/entities/user.entity';
import { ThrottleBy } from '../decorators/throttle-by.decorator';
import type { AuthRequest } from '../types/auth.types';
import { AuthThrottlerGuard } from './auth-throttler.guard';

class Routes {
  @ThrottleBy('identifier')
  login(this: void) {}

  @ThrottleBy('email')
  forgotPassword(this: void) {}

  register(this: void) {}
}

@ThrottleBy('email')
class EmailRoutes {
  contact(this: void) {}

  @ThrottleBy('identifier')
  other(this: void) {}
}

/** Makes the protected tracker callable, as the base guard calls it. */
class TestGuard extends AuthThrottlerGuard {
  tracker(
    req: object,
    controller: abstract new () => object = Routes,
    handler: () => void = Routes.prototype.login,
  ): Promise<string> {
    const context = new ExecutionContextHost(
      [req],
      controller as never,
      handler,
    );
    return this.getTracker(req as AuthRequest, context);
  }
}

const guard = new TestGuard(
  { throttlers: [] },
  new ThrottlerStorageService(),
  new Reflector(),
);

const IP = '203.0.113.7';
const USER_ID = '019a1b2c-3d4e-7f50-8a6b-7c8d9e0f1a2b';

describe('AuthThrottlerGuard', () => {
  it('counts a logged-in caller against their account, whatever the IP or route', async () => {
    const user = { id: USER_ID, role: UserRole.Customer };
    const body = { identifier: 'ivan@example.com' };

    expect(await guard.tracker({ ip: IP, user, body })).toBe(`user:${USER_ID}`);
    expect(
      await guard.tracker(
        { ip: '198.51.100.2', user },
        Routes,
        Routes.prototype.register,
      ),
    ).toBe(`user:${USER_ID}`);
  });

  it('@ThrottleBy("identifier"): the IP and the identifier', async () => {
    expect(
      await guard.tracker({ ip: IP, body: { identifier: 'ivan@example.com' } }),
    ).toBe(`${IP}|ivan@example.com`);
  });

  it('@ThrottleBy("email"): the IP and the email, not another field', async () => {
    expect(
      await guard.tracker(
        {
          ip: IP,
          body: { email: 'olena@example.com', identifier: 'ivan@example.com' },
        },
        Routes,
        Routes.prototype.forgotPassword,
      ),
    ).toBe(`${IP}|olena@example.com`);
  });

  it('normalises the value as the lookups do: trimmed, any case', async () => {
    expect(
      await guard.tracker({
        ip: IP,
        body: { identifier: ' Ivan@Example.COM ' },
      }),
    ).toBe(`${IP}|ivan@example.com`);
  });

  it('counts a route without @ThrottleBy by IP alone, whatever the body', async () => {
    expect(
      await guard.tracker(
        {
          ip: IP,
          body: { email: 'ivan@example.com', identifier: 'ivan@example.com' },
        },
        Routes,
        Routes.prototype.register,
      ),
    ).toBe(IP);
  });

  it('takes @ThrottleBy from the controller; a method one wins', async () => {
    const body = { email: 'olena@example.com', identifier: 'ivan@example.com' };

    expect(
      await guard.tracker(
        { ip: IP, body },
        EmailRoutes,
        EmailRoutes.prototype.contact,
      ),
    ).toBe(`${IP}|olena@example.com`);
    expect(
      await guard.tracker(
        { ip: IP, body },
        EmailRoutes,
        EmailRoutes.prototype.other,
      ),
    ).toBe(`${IP}|ivan@example.com`);
  });

  it.each([
    ['no body', undefined],
    ['a body without the field', { refreshToken: 'x' }],
    ['a non-string value', { identifier: ['ivan@example.com'] }],
    ['an array body', [{ identifier: 'ivan@example.com' }]],
  ])('counts against the IP alone for %s', async (_, body) => {
    expect(await guard.tracker({ ip: IP, body })).toBe(IP);
  });

  it('keeps the base IPv6 handling: one /64 network is one client', async () => {
    const a = await guard.tracker({ ip: '2001:db8:1:2:aaaa::1' });
    const b = await guard.tracker({ ip: '2001:db8:1:2:bbbb::2' });

    expect(a).toBe(b);
    expect(a).not.toBe(await guard.tracker({ ip: '2001:db8:1:3::1' }));
  });
});
