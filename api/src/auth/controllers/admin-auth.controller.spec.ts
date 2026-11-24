import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ConfigService } from '@nestjs/config';
import type { AuthResultDto } from '../dto/auth-result.dto';
import type { AuthService } from '../services/auth.service';
import { AdminAuthController } from './admin-auth.controller';

const SESSION: AuthResultDto = {
  accessToken: 'access.token.jwt',
  expiresIn: 900,
  refreshToken: 'refresh-token-43-characters-long-abcdefghij',
  refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  user: { id: 'u1' } as AuthResultDto['user'],
};

/** The controller with a fake AuthService, as configured for `nodeEnv`. */
function controller(nodeEnv: string) {
  const auth = {
    staffLogin: jest.fn().mockResolvedValue(SESSION),
    staffRefresh: jest.fn().mockResolvedValue(SESSION),
    logout: jest.fn().mockResolvedValue(undefined),
  };
  const config = { getOrThrow: () => nodeEnv } as unknown as ConfigService;
  return {
    auth,
    controller: new AdminAuthController(auth as unknown as AuthService, config),
  };
}

/** A response that records the `Set-Cookie` it is given. */
function response() {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (name: string, value: string) => {
      headers[name.toLowerCase()] = value;
    },
  } as unknown as ServerResponse;
  return { res, cookie: () => headers['set-cookie'] };
}

const withCookie = (value: string) =>
  ({ headers: { cookie: `sf_admin_refresh=${value}` } }) as IncomingMessage;

describe('AdminAuthController', () => {
  it('marks the cookie Secure in production', async () => {
    const { res, cookie } = response();

    await controller('production').controller.login(
      { email: 'a@example.com', password: 'x' },
      res,
    );

    expect(cookie()).toMatch(
      /^sf_admin_refresh=refresh-token-43-characters-long-abcdefghij; Path=\/api\/admin\/auth; Expires=.+; Max-Age=\d+; HttpOnly; Secure; SameSite=Strict$/,
    );
  });

  it.each(['development', 'test'])(
    'leaves Secure off in %s (plain http)',
    async (nodeEnv) => {
      const { res, cookie } = response();

      await controller(nodeEnv).controller.login(
        { email: 'a@example.com', password: 'x' },
        res,
      );

      expect(cookie()).not.toContain('Secure');
    },
  );

  it('deletes the cookie with the same attributes it was set with', async () => {
    const { res, cookie } = response();

    await controller('production').controller.logout(withCookie('abc'), res);

    expect(cookie()).toBe(
      'sf_admin_refresh=; Path=/api/admin/auth; ' +
        'Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; Secure; SameSite=Strict',
    );
  });

  it('never puts the refresh token in the body', async () => {
    const { res } = response();
    const { controller: admin } = controller('production');

    const login = await admin.login(
      { email: 'a@example.com', password: 'x' },
      res,
    );
    const refreshed = await admin.refresh(withCookie('abc'), res);

    for (const { data } of [login, refreshed]) {
      expect(data).toEqual({
        accessToken: 'access.token.jwt',
        expiresIn: 900,
        user: { id: 'u1' },
      });
    }
  });

  it('refreshes with the token from the cookie, and logs out with it', async () => {
    const { res } = response();
    const { auth, controller: admin } = controller('test');

    await admin.refresh(withCookie('from-cookie'), res);
    await admin.logout(withCookie('from-cookie'), res);

    expect(auth.staffRefresh).toHaveBeenCalledWith('from-cookie');
    expect(auth.logout).toHaveBeenCalledWith('from-cookie');
  });

  it('deletes the cookie when the refresh fails, and passes the error on', async () => {
    const { res, cookie } = response();
    const { auth, controller: admin } = controller('test');
    const failure = new Error('refused');
    auth.staffRefresh.mockRejectedValue(failure);

    await expect(admin.refresh(withCookie('used'), res)).rejects.toBe(failure);
    expect(cookie()).toMatch(/^sf_admin_refresh=; /);
  });
});
