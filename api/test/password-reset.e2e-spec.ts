import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { hashToken } from '@/common/crypto/tokens';
import {
  AccountToken,
  AccountTokenPurpose,
} from '@/users/entities/account-token.entity';
import { User } from '@/users/entities/user.entity';
import { AccountTokensService } from '@/users/services/account-tokens.service';
import { UsersService } from '@/users/services/users.service';
import { loginAs } from './utils/auth';
import { resetDatabase, waitForLockWait } from './utils/database';
import { createUser, daysFromNow, TEST_PASSWORD } from './utils/factories';
import { linkToken, mailbox } from './utils/mail';
import { createTestApp } from './utils/test-app';
import { resetRateLimits } from './utils/throttler';

const NEW_PASSWORD = 'a brand new secret';

/** The token from the newest email's link (`…/reset-password#token=…`). */
async function tokenFromMail(app: INestApplication): Promise<string> {
  return linkToken((await mailbox(app)).sent.at(-1));
}

describe('Password reset (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let user: User;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // First: the last test's background lookups must not overlap the reset.
    (await mailbox(app)).clear();
    await resetDatabase(dataSource);
    resetRateLimits(app);
    user = await createUser(dataSource, { email: 'Ivan@Example.com' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const http = () => request(app.getHttpServer());
  const forgot = (email: string) =>
    http().post('/api/auth/forgot-password').send({ email });
  const reset = (token: string, newPassword = NEW_PASSWORD) =>
    http().post('/api/auth/reset-password').send({ token, newPassword });
  const login = (password: string) =>
    http()
      .post('/api/auth/login')
      .send({ email: 'ivan@example.com', password });
  const refresh = (refreshToken: string) =>
    http().post('/api/auth/refresh').send({ refreshToken });

  /** Requests a link for Ivan and returns its token. */
  async function requestLink(): Promise<string> {
    await forgot('ivan@example.com').expect(204);
    return tokenFromMail(app);
  }

  const tokenRows = () => dataSource.getRepository(AccountToken);

  function expectInvalidToken(res: request.Response) {
    expect(res.status).toBe(400);
    expect((res.body as { error: object }).error).toMatchObject({
      code: 'INVALID_TOKEN',
      message: 'This link is invalid or has expired',
    });
  }

  describe('POST /auth/forgot-password', () => {
    it("emails a link to the account's own address, in its stored case", async () => {
      const res = await forgot(' IVAN@example.COM ').expect(204);

      expect(res.text).toBe('');
      const { sent } = await mailbox(app);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        to: 'Ivan@Example.com',
        subject: 'Відновлення пароля',
      });
      expect(sent[0].text).toMatch(
        /http:\/\/localhost:3000\/reset-password#token=[\w-]{43}\n/,
      );
    });

    it('stores only the hash of the token, valid for 1 hour', async () => {
      const before = Date.now();
      const token = await requestLink();

      const [row] = await tokenRows().find();
      expect(row).toMatchObject({
        userId: user.id,
        purpose: AccountTokenPurpose.PasswordReset,
        tokenHash: hashToken(token),
        usedAt: null,
      });
      expect(JSON.stringify(row)).not.toContain(token);
      const ttl = row.expiresAt.getTime() - before;
      expect(ttl).toBeGreaterThan(59 * 60_000);
      expect(ttl).toBeLessThanOrEqual(60 * 60_000 + 1_000);
    });

    it.each([
      ['an unknown email', 'nobody@example.com', () => Promise.resolve()],
      [
        'a blocked account',
        'ivan@example.com',
        () => dataSource.getRepository(User).update(user.id, { blocked: true }),
      ],
    ])(
      'answers %s the same way, and sends nothing',
      async (_, email, setUp) => {
        await setUp();

        const res = await forgot(email).expect(204);

        expect(res.text).toBe('');
        expect((await mailbox(app)).sent).toEqual([]);
        expect(await tokenRows().count()).toBe(0);
      },
    );

    it('answers before looking the account up: a failing lookup still gets 204', async () => {
      jest
        .spyOn(app.get(UsersService), 'findByEmail')
        .mockRejectedValue(new Error('database is down'));

      await forgot('ivan@example.com').expect(204);
      expect((await mailbox(app)).sent).toEqual([]);
    });

    it('takes an email, not a name', async () => {
      await forgot(user.name).expect(400);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('sets the new password, ends every session, and logs nobody in', async () => {
      const laptop = await loginAs(app, user);
      const phone = await loginAs(app, user);
      const token = await requestLink();

      const res = await reset(token).expect(204);

      expect(res.text).toBe('');
      await refresh(laptop.refreshToken).expect(401);
      await refresh(phone.refreshToken).expect(401);
      await login(TEST_PASSWORD).expect(401);
      await login(NEW_PASSWORD).expect(200);
    });

    it('counts the email as verified: the link proved the mailbox', async () => {
      await reset(await requestLink()).expect(204);

      const saved = await dataSource
        .getRepository(User)
        .findOneByOrFail({ id: user.id });
      expect(saved.emailVerifiedAt).toBeInstanceOf(Date);
    });

    it('works once only', async () => {
      const token = await requestLink();
      await reset(token).expect(204);

      expectInvalidToken(await reset(token, 'yet another secret'));
      await login(NEW_PASSWORD).expect(200);
    });

    it('refuses a use that overlaps another: only one can win', async () => {
      const token = await requestLink();
      // Another use holds the token's row: marked used, not yet committed.
      const other = dataSource.createQueryRunner();
      await other.startTransaction();
      try {
        await other.manager.update(
          AccountToken,
          { tokenHash: hashToken(token) },
          { usedAt: new Date() },
        );

        // This one still reads the token as unused, then waits for the row
        // lock; once the other commits, it must lose.
        const overlapping = reset(token).then((res) => res.status);
        await waitForLockWait(dataSource);
        await other.commitTransaction();

        expect(await overlapping).toBe(400);
      } finally {
        if (other.isTransactionActive) await other.rollbackTransaction();
        await other.release();
      }
      await login(TEST_PASSWORD).expect(200); // the password never changed
    });

    it('refuses an expired link', async () => {
      const token = await requestLink();
      await tokenRows().update(
        { tokenHash: hashToken(token) },
        { expiresAt: daysFromNow(-0.0001) },
      );

      expectInvalidToken(await reset(token));
      await login(TEST_PASSWORD).expect(200);
    });

    it('refuses a link replaced by a newer one; the newer one works', async () => {
      const first = await requestLink();
      const second = await requestLink();

      expectInvalidToken(await reset(first));
      await reset(second).expect(204);
    });

    it.each([
      [
        'the email changed after the link was sent',
        (id: string) =>
          dataSource
            .getRepository(User)
            .update(id, { email: 'olena@example.com' }),
      ],
      [
        'the account was blocked',
        (id: string) =>
          dataSource.getRepository(User).update(id, { blocked: true }),
      ],
      [
        'the account was deleted',
        (id: string) => dataSource.getRepository(User).delete(id),
      ],
    ])('refuses the link when %s', async (_, change) => {
      const token = await requestLink();
      await change(user.id);

      expectInvalidToken(await reset(token));
    });

    it("refuses another purpose's token: a verification link can't reset", async () => {
      const verification = await app
        .get(AccountTokensService)
        .issue(user, AccountTokenPurpose.EmailVerification);

      expectInvalidToken(await reset(verification));
      await login(TEST_PASSWORD).expect(200);
    });

    it('accepts the email back in another letter case (citext)', async () => {
      const token = await requestLink();
      await dataSource
        .getRepository(User)
        .update(user.id, { email: 'IVAN@EXAMPLE.COM' });

      await reset(token).expect(204);
    });

    it.each([
      ['an unknown token', 'q3Jx0bY1o7k8e5H2nqQ9sT4uV6wX8yZ0aB1cD2eF3gH'],
      ['a malformed token', 'not a token'],
      ['an access token', 'eyJhbGciOiJIUzI1NiJ9.e30.x'],
    ])('answers %s with the same INVALID_TOKEN', async (_, token) => {
      expectInvalidToken(await reset(token));
    });

    it('keeps the link usable when the new password is refused', async () => {
      const token = await requestLink();

      const res = await reset(token, 'short').expect(400);
      expect((res.body as { error: { code: string } }).error.code).toBe(
        'BAD_REQUEST',
      );

      await reset(token).expect(204);
    });

    it('refuses a body without a token or password with 400', async () => {
      await http()
        .post('/api/auth/reset-password')
        .send({ newPassword: NEW_PASSWORD })
        .expect(400);
      await http()
        .post('/api/auth/reset-password')
        .send({ token: 'x' })
        .expect(400);
    });
  });
});
