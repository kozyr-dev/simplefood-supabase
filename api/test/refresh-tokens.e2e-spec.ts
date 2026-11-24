import {
  INestApplication,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource, type Repository } from 'typeorm';
import { RefreshToken } from '@/auth/entities/refresh-token.entity';
import {
  REUSE_GRACE_MS,
  RefreshTokensService,
} from '@/auth/services/refresh-tokens.service';
import { hashToken } from '@/common/crypto/tokens';
import { User, UserRole } from '@/users/entities/user.entity';
import { resetDatabase, waitForLockWait } from './utils/database';
import { createUser, daysFromNow } from './utils/factories';
import { createTestApp } from './utils/test-app';

const DAY_MS = 24 * 60 * 60 * 1000;

/*
 * Against real Postgres: rotation relies on a transaction and on how
 * concurrent UPDATEs of one row behave, which a mocked repository can't show.
 * Time is moved by editing rows (expiresAt, revokedAt), never by waiting.
 */
describe('RefreshTokensService (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let service: RefreshTokensService;
  let rows: Repository<RefreshToken>;
  let user: User;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    service = app.get(RefreshTokensService);
    rows = dataSource.getRepository(RefreshToken);
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
    user = await createUser(dataSource);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const rowOf = (token: string) =>
    rows.findOneOrFail({ where: { tokenHash: hashToken(token) } });

  const updateRow = (token: string, changes: Partial<RefreshToken>) =>
    rows.update({ tokenHash: hashToken(token) }, changes);

  /** Rotates, expecting the one 401 every failure gets. */
  async function expectRefused(token: string): Promise<void> {
    const error: unknown = await service.rotate(token).then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).getResponse()).toEqual({
      message: 'Invalid refresh token',
      code: 'INVALID_REFRESH_TOKEN',
    });
  }

  const expectAround = (actual: Date, expected: number) =>
    expect(Math.abs(actual.getTime() - expected)).toBeLessThan(5_000);

  describe('issue', () => {
    it('returns a random 256-bit token and stores only its hash', async () => {
      const { token } = await service.issue(user.id);
      const row = await rowOf(token);

      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(row.tokenHash).toBe(hashToken(token));
      expect(row.tokenHash).not.toContain(token);
      expect(row.revokedAt).toBeNull();
    });

    it('expires after 7 idle days, the session after 30', async () => {
      const { token, expiresAt } = await service.issue(user.id);
      const row = await rowOf(token);

      expectAround(expiresAt, Date.now() + 7 * DAY_MS);
      expect(row.expiresAt).toEqual(expiresAt);
      expectAround(row.familyExpiresAt, Date.now() + 30 * DAY_MS);
    });

    it('starts a new session (family) on every call', async () => {
      const first = await rowOf((await service.issue(user.id)).token);
      const second = await rowOf((await service.issue(user.id)).token);

      expect(first.familyId).not.toBe(second.familyId);
    });

    it("deletes the user's expired sessions, nothing else", async () => {
      const other = await createUser(dataSource);
      const expired = (await service.issue(user.id)).token;
      const live = (await service.issue(user.id)).token;
      const othersExpired = (await service.issue(other.id)).token;
      await updateRow(expired, { familyExpiresAt: daysFromNow(-1) });
      await updateRow(othersExpired, { familyExpiresAt: daysFromNow(-1) });

      await service.issue(user.id);

      expect(await rows.existsBy({ tokenHash: hashToken(expired) })).toBe(
        false,
      );
      expect(await rows.existsBy({ tokenHash: hashToken(live) })).toBe(true);
      expect(await rows.existsBy({ tokenHash: hashToken(othersExpired) })).toBe(
        true,
      );
    });
  });

  describe('rotate', () => {
    it('replaces the token with a new one in the same session', async () => {
      const { token } = await service.issue(user.id);
      const before = await rowOf(token);

      const { user: owner, refreshToken } = await service.rotate(token);
      const used = await rowOf(token);
      const next = await rowOf(refreshToken.token);

      expect(owner.id).toBe(user.id);
      expect(refreshToken.token).not.toBe(token);
      expect(used.revokedAt).not.toBeNull();
      expect(next).toMatchObject({
        familyId: before.familyId,
        familyExpiresAt: before.familyExpiresAt,
        revokedAt: null,
      });
      expectAround(next.expiresAt, Date.now() + 7 * DAY_MS);
    });

    it('chains: each new token rotates again', async () => {
      let { token } = await service.issue(user.id);
      for (let i = 0; i < 3; i++) {
        token = (await service.rotate(token)).refreshToken.token;
      }

      expect(await rows.countBy({ user: { id: user.id } })).toBe(4);
    });

    it('returns the user as stored now (a new role applies at the next refresh)', async () => {
      const { token } = await service.issue(user.id);
      await dataSource
        .getRepository(User)
        .update(user.id, { role: UserRole.Editor });

      expect((await service.rotate(token)).user.role).toBe(UserRole.Editor);
    });

    it('never sets an expiry past the end of the session', async () => {
      const { token } = await service.issue(user.id);
      const sessionEnd = daysFromNow(2);
      await updateRow(token, { familyExpiresAt: sessionEnd });

      const { refreshToken } = await service.rotate(token);

      expect(refreshToken.expiresAt).toEqual(sessionEnd);
    });

    it('refuses an unknown token', async () => {
      await expectRefused('a'.repeat(43));
    });

    it('refuses a token after 7 idle days', async () => {
      const { token } = await service.issue(user.id);
      await updateRow(token, { expiresAt: new Date(Date.now() - 1000) });

      await expectRefused(token);
    });

    it('refuses a token once the session is 30 days old', async () => {
      const { token } = await service.issue(user.id);
      await updateRow(token, { familyExpiresAt: new Date(Date.now() - 1000) });

      await expectRefused(token);
    });

    it('refuses a blocked user and ends the session', async () => {
      const { token } = await service.issue(user.id);
      await dataSource.getRepository(User).update(user.id, { blocked: true });

      await expectRefused(token);
      expect((await rowOf(token)).revokedAt).not.toBeNull();
    });

    it("refuses a deleted user's token (deleted with the user)", async () => {
      const { token } = await service.issue(user.id);
      await dataSource.getRepository(User).delete(user.id);

      await expectRefused(token);
    });

    describe('reuse detection', () => {
      it('a used token coming back later ends the whole session', async () => {
        const warn = jest.spyOn(Logger.prototype, 'warn');
        const { token: stolen } = await service.issue(user.id);
        const { token: current } = (await service.rotate(stolen)).refreshToken;
        await updateRow(stolen, {
          revokedAt: new Date(Date.now() - REUSE_GRACE_MS - 1000),
        });

        await expectRefused(stolen);
        // The legitimate client's token is gone too: it must log in again.
        await expectRefused(current);
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('Refresh token reuse'),
        );
        expect(warn).not.toHaveBeenCalledWith(expect.stringContaining(stolen));
      });

      it('within the grace window, the token is refused but the session lives', async () => {
        const { token } = await service.issue(user.id);
        const { token: current } = (await service.rotate(token)).refreshToken;

        await expectRefused(token);
        await expect(service.rotate(current)).resolves.toBeDefined();
      });

      it('only touches the session the reused token belongs to', async () => {
        const { token: stolen } = await service.issue(user.id);
        const { token: otherDevice } = await service.issue(user.id);
        await service.rotate(stolen);
        await updateRow(stolen, {
          revokedAt: new Date(Date.now() - REUSE_GRACE_MS - 1000),
        });

        await expectRefused(stolen);
        await expect(service.rotate(otherDevice)).resolves.toBeDefined();
      });

      it('parallel refreshes with one token: exactly one wins, the session lives', async () => {
        const { token } = await service.issue(user.id);

        const results = await Promise.allSettled(
          Array.from({ length: 5 }, () => service.rotate(token)),
        );
        const won = results.filter((result) => result.status === 'fulfilled');

        expect(won).toHaveLength(1);
        // The used token plus one successor: the session didn't fork.
        expect(await rows.count()).toBe(2);
        await expect(
          service.rotate(won[0].value.refreshToken.token),
        ).resolves.toBeDefined();
      });

      // The test above passes whenever the requests happen not to overlap.
      // This one forces the overlap: rotate() reads the token while another
      // transaction is using it up, then has to wait for that one's lock.
      it('a refresh that read the token before a parallel one used it up is refused', async () => {
        const { token } = await service.issue(user.id);
        const other = dataSource.createQueryRunner();
        await other.connect();
        try {
          await other.startTransaction();
          await other.manager.update(
            RefreshToken,
            { tokenHash: hashToken(token) },
            { revokedAt: new Date() },
          );

          // Not committed yet: rotate() still sees a usable token, and its
          // UPDATE waits for the row lock.
          const rotation = service.rotate(token).then(
            () => 'rotated',
            () => 'refused',
          );
          await waitForLockWait(dataSource);
          await other.commitTransaction();

          expect(await rotation).toBe('refused');
          expect(await rows.count()).toBe(1); // no successor was issued
        } finally {
          await other.release();
        }
      });
    });
  });

  describe('revokeFamily (logout)', () => {
    it('ends that session only', async () => {
      const { token } = await service.issue(user.id);
      const { token: current } = (await service.rotate(token)).refreshToken;
      const { token: otherDevice } = await service.issue(user.id);

      await service.revokeFamily(current);

      await expectRefused(current);
      await expect(service.rotate(otherDevice)).resolves.toBeDefined();
    });

    it('works with an older token of the session too', async () => {
      const { token } = await service.issue(user.id);
      const { token: current } = (await service.rotate(token)).refreshToken;

      await service.revokeFamily(token);

      await expectRefused(current);
    });

    it('ignores unknown tokens', async () => {
      await expect(service.revokeFamily('unknown')).resolves.toBeUndefined();
    });
  });

  describe('revokeAllForUser', () => {
    it("ends every session of the user, nobody else's", async () => {
      const other = await createUser(dataSource);
      const first = (await service.issue(user.id)).token;
      const second = (await service.issue(user.id)).token;
      const others = (await service.issue(other.id)).token;

      await service.revokeAllForUser(user.id);

      await expectRefused(first);
      await expectRefused(second);
      await expect(service.rotate(others)).resolves.toBeDefined();
    });

    it('takes part in the caller transaction', async () => {
      const { token } = await service.issue(user.id);

      await dataSource
        .transaction(async (manager) => {
          await service.revokeAllForUser(user.id, manager);
          throw new Error('roll back');
        })
        .catch(() => undefined);

      await expect(service.rotate(token)).resolves.toBeDefined();
    });
  });
});
