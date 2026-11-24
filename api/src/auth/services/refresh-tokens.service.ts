import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  IsNull,
  LessThan,
  type EntityManager,
  type Repository,
} from 'typeorm';
import { generateToken, hashToken } from '@/common/crypto/tokens';
import authConfig, { type AuthConfig } from '@/config/auth.config';
import type { User } from '@/users/entities/user.entity';
import { RefreshToken } from '../entities/refresh-token.entity';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A used token that comes back within this window is refused without ending
 * the session: it's a client sending parallel refreshes with the same token
 * (the frontend's fetchWithAuth does on parallel 401s), not a thief.
 */
export const REUSE_GRACE_MS = 10_000;

export interface IssuedRefreshToken {
  /** Give it to the client once; only its hash is stored. */
  token: string;
  expiresAt: Date;
}

export interface RotatedRefreshToken {
  /** Loaded fresh: a role change or block applies from the next refresh. */
  user: User;
  refreshToken: IssuedRefreshToken;
}

/** Same error for unknown, used, expired and revoked: no hints for a thief. */
export function invalidRefreshToken(): UnauthorizedException {
  return new UnauthorizedException({
    message: 'Invalid refresh token',
    code: 'INVALID_REFRESH_TOKEN',
  });
}

/**
 * Opaque refresh tokens, rotated on every use (OAuth 2.0 Security BCP). A
 * family is one login session: each refresh revokes the token it was given
 * and issues the next one in the same family. A revoked token presented
 * again means two parties hold it, so the whole family is revoked (reuse
 * detection); the legitimate client then has to log in again.
 */
@Injectable()
export class RefreshTokensService {
  private readonly logger = new Logger(RefreshTokensService.name);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly tokens: Repository<RefreshToken>,
    private readonly dataSource: DataSource,
    @Inject(authConfig.KEY) private readonly config: AuthConfig,
  ) {}

  /**
   * Starts a new family (login, registration, password change). Pass the
   * manager to take part in the caller's transaction.
   */
  async issue(
    userId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<IssuedRefreshToken> {
    const repository = manager.getRepository(RefreshToken);
    const now = new Date();

    // Expired families can't be used or reused any more. Dropping this user's
    // on every login keeps the table small without a scheduled job.
    await repository.delete({
      user: { id: userId },
      familyExpiresAt: LessThan(now),
    });

    return this.insert(repository, {
      userId,
      familyId: randomUUID(),
      familyExpiresAt: new Date(
        now.getTime() + this.config.refreshMaxTtlDays * DAY_MS,
      ),
      now,
    });
  }

  /**
   * Exchanges a valid token for the next one in its family. Throws a 401
   * (`INVALID_REFRESH_TOKEN`) otherwise.
   */
  async rotate(token: string): Promise<RotatedRefreshToken> {
    // Failures still commit: revoking a family must survive the 401.
    const rotated = await this.dataSource.transaction((manager) =>
      this.tryRotate(manager.getRepository(RefreshToken), token),
    );
    if (!rotated) {
      throw invalidRefreshToken();
    }
    return rotated;
  }

  /** Logout: ends the token's session. Unknown tokens are ignored. */
  async revokeFamily(token: string): Promise<void> {
    const stored = await this.tokens.findOne({
      select: { id: true, familyId: true },
      where: { tokenHash: hashToken(token) },
    });
    if (stored) {
      await this.revokeFamilyById(this.tokens, stored.familyId, new Date());
    }
  }

  /** Ends every session of the user (password change, block). */
  async revokeAllForUser(
    userId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    await manager
      .getRepository(RefreshToken)
      .update(
        { user: { id: userId }, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
  }

  private async tryRotate(
    repository: Repository<RefreshToken>,
    token: string,
  ): Promise<RotatedRefreshToken | null> {
    const now = new Date();
    const stored = await repository.findOne({
      where: { tokenHash: hashToken(token) },
      relations: { user: true },
    });
    if (!stored) {
      return null;
    }

    if (stored.revokedAt) {
      if (now.getTime() - stored.revokedAt.getTime() >= REUSE_GRACE_MS) {
        await this.revokeFamilyById(repository, stored.familyId, now);
        this.logger.warn(
          `Refresh token reuse: revoked session ${stored.familyId} of user ${stored.user.id}`,
        );
      }
      return null;
    }

    if (stored.expiresAt <= now || stored.familyExpiresAt <= now) {
      return null;
    }

    if (stored.user.blocked) {
      await this.revokeFamilyById(repository, stored.familyId, now);
      return null;
    }

    // Use the token up only if no parallel refresh did first. Postgres makes
    // the second UPDATE wait for the first to commit, then re-checks
    // `revoked_at IS NULL`: exactly one of them gets a row.
    const { affected } = await repository.update(
      { id: stored.id, revokedAt: IsNull() },
      { revokedAt: now },
    );
    if (!affected) {
      return null;
    }

    return {
      user: stored.user,
      refreshToken: await this.insert(repository, {
        userId: stored.user.id,
        familyId: stored.familyId,
        familyExpiresAt: stored.familyExpiresAt,
        now,
      }),
    };
  }

  private async insert(
    repository: Repository<RefreshToken>,
    family: {
      userId: string;
      familyId: string;
      familyExpiresAt: Date;
      now: Date;
    },
  ): Promise<IssuedRefreshToken> {
    const token = generateToken();
    // Idle expiry, but never past the end of the session.
    const expiresAt = new Date(
      Math.min(
        family.now.getTime() + this.config.refreshTtlDays * DAY_MS,
        family.familyExpiresAt.getTime(),
      ),
    );

    await repository.insert({
      user: { id: family.userId },
      familyId: family.familyId,
      tokenHash: hashToken(token),
      expiresAt,
      familyExpiresAt: family.familyExpiresAt,
    });
    return { token, expiresAt };
  }

  private async revokeFamilyById(
    repository: Repository<RefreshToken>,
    familyId: string,
    now: Date,
  ): Promise<void> {
    await repository.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: now },
    );
  }
}
