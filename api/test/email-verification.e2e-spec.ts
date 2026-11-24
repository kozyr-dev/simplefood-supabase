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
import { bearer, loginAs } from './utils/auth';
import { resetDatabase } from './utils/database';
import { createUser, daysFromNow, TEST_PASSWORD } from './utils/factories';
import { linkToken, mailbox } from './utils/mail';
import { createTestApp } from './utils/test-app';
import { resetRateLimits } from './utils/throttler';

/** The shop's address in the e2e environment (MAIL_NOTIFY_TO). */
const SHOP = 'shop@example.com';

describe('Email verification and account notices (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    (await mailbox(app)).clear();
    await resetDatabase(dataSource);
    resetRateLimits(app);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const http = () => request(app.getHttpServer());
  const users = () => dataSource.getRepository(User);
  const tokenRows = () => dataSource.getRepository(AccountToken);
  const sent = async () => (await mailbox(app)).sent;

  const register = (email = 'Ivan@Example.com') =>
    http().post('/api/auth/register').send({
      name: 'Ivan Petrenko',
      email,
      password: TEST_PASSWORD,
    });
  const verify = (token: string) =>
    http().post('/api/auth/verify-email').send({ token });
  const resend = (accessToken: string) =>
    http().post('/api/auth/resend-verification').set(bearer(accessToken));
  const getMe = (accessToken: string) =>
    http().get('/api/users/me').set(bearer(accessToken));
  const patchMe = (accessToken: string, body: object) =>
    http().patch('/api/users/me').set(bearer(accessToken)).send(body);

  /** Whether the stored account counts its email as verified. */
  const isVerified = async (id: string) =>
    (await users().findOneByOrFail({ id })).emailVerifiedAt !== null;

  function expectInvalidToken(res: request.Response) {
    expect(res.status).toBe(400);
    expect((res.body as { error: object }).error).toMatchObject({
      code: 'INVALID_TOKEN',
      message: 'This link is invalid or has expired',
    });
  }

  /** A user whose email is already verified, and a session for them. */
  async function verifiedUser(email = 'ivan@example.com') {
    const user = await createUser(dataSource, {
      email,
      emailVerifiedAt: new Date(),
    });
    return { user, accessToken: (await loginAs(app, user)).accessToken };
  }

  describe('POST /auth/register', () => {
    it('sends a verification link to the address as typed; the account starts unverified', async () => {
      const res = await register().expect(201);

      expect(res.body.data.user.emailVerified).toBe(false);
      const mails = await sent();
      expect(mails).toHaveLength(1);
      expect(mails[0]).toMatchObject({
        to: 'Ivan@Example.com',
        subject: 'Підтвердження email',
      });
      expect(mails[0].text).toMatch(
        /http:\/\/localhost:3000\/verify-email#token=[\w-]{43}\n/,
      );
    });

    it('stores only the hash of the token, valid for 48 hours', async () => {
      const before = Date.now();
      await register().expect(201);
      const token = linkToken((await sent())[0]);

      const [row] = await tokenRows().find();
      expect(row).toMatchObject({
        purpose: AccountTokenPurpose.EmailVerification,
        tokenHash: hashToken(token),
        email: 'Ivan@Example.com',
        usedAt: null,
      });
      const ttl = row.expiresAt.getTime() - before;
      expect(ttl).toBeGreaterThan(47.9 * 3_600_000);
      expect(ttl).toBeLessThanOrEqual(48 * 3_600_000 + 1_000);
    });

    it('leaves no account behind when the token cannot be issued', async () => {
      jest
        .spyOn(app.get(AccountTokensService), 'issue')
        .mockRejectedValueOnce(new Error('database is down'));

      await register().expect(500);

      expect(await users().count()).toBe(0);
      expect(await sent()).toEqual([]);
    });

    it('still registers when the email cannot be sent', async () => {
      (await mailbox(app)).failNext();

      await register().expect(201);
      expect(await users().count()).toBe(1);
    });
  });

  describe('POST /auth/verify-email', () => {
    it('verifies the email, without a login (the link may open elsewhere)', async () => {
      const { accessToken } = (await register().expect(201)).body.data;
      const token = linkToken((await sent())[0]);

      const res = await verify(token).expect(204);

      expect(res.text).toBe('');
      const me = await getMe(accessToken).expect(200);
      expect(me.body.data.emailVerified).toBe(true);
    });

    it('works once only', async () => {
      await register().expect(201);
      const token = linkToken((await sent())[0]);
      await verify(token).expect(204);

      expectInvalidToken(await verify(token));
    });

    it('refuses an expired link', async () => {
      const { user } = (await register().expect(201)).body.data;
      const token = linkToken((await sent())[0]);
      await tokenRows().update(
        { tokenHash: hashToken(token) },
        { expiresAt: daysFromNow(-0.0001) },
      );

      expectInvalidToken(await verify(token));
      expect(await isVerified(user.id)).toBe(false);
    });

    it("refuses a blocked account's link", async () => {
      const { user } = (await register().expect(201)).body.data;
      const token = linkToken((await sent())[0]);
      await users().update(user.id, { blocked: true });

      expectInvalidToken(await verify(token));
      expect(await isVerified(user.id)).toBe(false);
    });

    it("refuses another purpose's token: a reset link can't verify", async () => {
      const user = await createUser(dataSource);
      const reset = await app
        .get(AccountTokensService)
        .issue(user, AccountTokenPurpose.PasswordReset);

      expectInvalidToken(await verify(reset));
      expect(await isVerified(user.id)).toBe(false);
    });

    it.each([
      ['an unknown token', 'q3Jx0bY1o7k8e5H2nqQ9sT4uV6wX8yZ0aB1cD2eF3gH'],
      ['a malformed token', 'not a token'],
    ])('answers %s with the same INVALID_TOKEN', async (_, token) => {
      expectInvalidToken(await verify(token));
    });

    it('refuses a body without a token with 400', async () => {
      await http().post('/api/auth/verify-email').send({}).expect(400);
    });
  });

  describe('POST /auth/resend-verification', () => {
    it('sends a new link to an unverified account; the earlier one stops working', async () => {
      const { accessToken } = (await register().expect(201)).body.data;
      const first = linkToken((await sent())[0]);

      const res = await resend(accessToken).expect(204);

      expect(res.text).toBe('');
      const mails = await sent();
      expect(mails).toHaveLength(2);
      expect(mails[1]).toMatchObject({
        to: 'Ivan@Example.com',
        subject: 'Підтвердження email',
      });
      expectInvalidToken(await verify(first));
      await verify(linkToken(mails[1])).expect(204);
    });

    it('sends nothing once the email is verified', async () => {
      const { accessToken } = await verifiedUser();

      await resend(accessToken).expect(204);

      expect(await sent()).toEqual([]);
      expect(await tokenRows().count()).toBe(0);
    });

    it('needs a login (401)', async () => {
      await http().post('/api/auth/resend-verification').expect(401);
    });

    it('refuses a token of an account blocked since (401)', async () => {
      const user = await createUser(dataSource);
      const { accessToken } = await loginAs(app, user);
      await users().update(user.id, { blocked: true });

      await resend(accessToken).expect(401);
      expect(await sent()).toEqual([]);
    });
  });

  describe('PATCH /users/me with a new email', () => {
    it('unverifies the account, sends a link to the new address and a notice to the old', async () => {
      const { user, accessToken } = await verifiedUser();

      const res = await patchMe(accessToken, {
        email: 'Olena@Example.com',
        currentPassword: TEST_PASSWORD,
      }).expect(200);

      expect(res.body.data).toMatchObject({
        email: 'Olena@Example.com',
        emailVerified: false,
      });
      expect(await isVerified(user.id)).toBe(false);

      const mails = await sent();
      expect(mails).toHaveLength(2);
      const link = mails.find((mail) => mail.to === 'Olena@Example.com');
      const notice = mails.find((mail) => mail.to === 'ivan@example.com');
      expect(link?.subject).toBe('Підтвердження email');
      expect(notice).toMatchObject({
        subject: 'Адресу email змінено',
        replyTo: SHOP,
      });
      // The old mailbox never learns the new address.
      expect(JSON.stringify(notice)).not.toMatch(/olena/i);

      await verify(linkToken(link)).expect(204);
      expect(await isVerified(user.id)).toBe(true);
    });

    it('cancels links sent to the old address', async () => {
      const { accessToken } = (await register().expect(201)).body.data;
      const oldLink = linkToken((await sent())[0]);

      await patchMe(accessToken, {
        email: 'olena@example.com',
        currentPassword: TEST_PASSWORD,
      }).expect(200);

      expectInvalidToken(await verify(oldLink));
    });

    it('treats a change of letter case as the same address: still verified, nothing sent', async () => {
      const { user, accessToken } = await verifiedUser();

      const res = await patchMe(accessToken, {
        email: 'IVAN@example.com',
        currentPassword: TEST_PASSWORD,
      }).expect(200);

      expect(res.body.data).toMatchObject({
        email: 'IVAN@example.com',
        emailVerified: true,
      });
      expect(await isVerified(user.id)).toBe(true);
      expect(await sent()).toEqual([]);
    });

    it('keeps verification and sends nothing when other fields change', async () => {
      const { user, accessToken } = await verifiedUser();

      await patchMe(accessToken, {
        name: 'Renamed',
        email: 'ivan@example.com',
      }).expect(200);

      expect(await isVerified(user.id)).toBe(true);
      expect(await sent()).toEqual([]);
    });

    it('changes nothing and sends nothing when the email is taken (409)', async () => {
      const { user, accessToken } = await verifiedUser();
      await createUser(dataSource, { email: 'olena@example.com' });

      await patchMe(accessToken, {
        email: 'olena@example.com',
        currentPassword: TEST_PASSWORD,
      }).expect(409);

      expect(await isVerified(user.id)).toBe(true);
      expect(await sent()).toEqual([]);
    });

    it('rolls the change back when the token cannot be issued', async () => {
      const { user, accessToken } = await verifiedUser();
      jest
        .spyOn(app.get(AccountTokensService), 'issue')
        .mockRejectedValueOnce(new Error('database is down'));

      await patchMe(accessToken, {
        email: 'olena@example.com',
        currentPassword: TEST_PASSWORD,
      }).expect(500);

      const stored = await users().findOneByOrFail({ id: user.id });
      expect(stored.email).toBe('ivan@example.com');
      expect(stored.emailVerifiedAt).not.toBeNull();
      expect(await sent()).toEqual([]);
    });
  });

  describe('password notices', () => {
    it('POST /auth/change-password sends a notice to the account', async () => {
      const { accessToken } = await verifiedUser();

      await http()
        .post('/api/auth/change-password')
        .set(bearer(accessToken))
        .send({
          currentPassword: TEST_PASSWORD,
          newPassword: 'a brand new secret',
        })
        .expect(200);

      expect(await sent()).toEqual([
        expect.objectContaining({
          to: 'ivan@example.com',
          replyTo: SHOP,
          subject: 'Пароль змінено',
        }),
      ]);
    });

    it('a refused change-password sends nothing', async () => {
      const { accessToken } = await verifiedUser();

      await http()
        .post('/api/auth/change-password')
        .set(bearer(accessToken))
        .send({
          currentPassword: 'wrong password',
          newPassword: 'a brand new secret',
        })
        .expect(400);

      expect(await sent()).toEqual([]);
    });

    it('POST /auth/reset-password sends a notice to the account', async () => {
      const { user } = await verifiedUser('Ivan@Example.com');
      const token = await app
        .get(AccountTokensService)
        .issue(user, AccountTokenPurpose.PasswordReset);

      await http()
        .post('/api/auth/reset-password')
        .send({ token, newPassword: 'a brand new secret' })
        .expect(204);

      expect(await sent()).toEqual([
        expect.objectContaining({
          to: 'Ivan@Example.com',
          replyTo: SHOP,
          subject: 'Пароль змінено',
        }),
      ]);
    });
  });
});
