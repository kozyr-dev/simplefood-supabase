import { Injectable } from '@nestjs/common';
import { DataSource, IsNull, LessThan, type EntityManager } from 'typeorm';
import { generateToken, hashToken } from '@/common/crypto/tokens';
import {
  AccountToken,
  AccountTokenPurpose,
} from '../entities/account-token.entity';
import { sameEmail } from '../entities/email';
import type { User } from '../entities/user.entity';

const HOUR_MS = 60 * 60 * 1000;

/**
 * How long a link works. Reset links are short (OWASP Forgot Password
 * cheat sheet): whoever reads the mailbox can take the account with one.
 */
export const ACCOUNT_TOKEN_TTL_MS: Record<AccountTokenPurpose, number> = {
  [AccountTokenPurpose.PasswordReset]: HOUR_MS,
  [AccountTokenPurpose.EmailVerification]: 48 * HOUR_MS,
};

/**
 * Single-use tokens for links sent by email. Each new link of a purpose
 * cancels the user's earlier unused ones, so only the newest works.
 */
@Injectable()
export class AccountTokensService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * A new token for `user`, bound to the address it's about to be sent to
   * (`user.email`). Returns the token for the link; only its hash is stored.
   */
  async issue(
    user: Pick<User, 'id' | 'email'>,
    purpose: AccountTokenPurpose,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<string> {
    const repository = manager.getRepository(AccountToken);
    const now = new Date();

    // Only the newest link of a purpose works; expired rows of any purpose
    // go too, so the table stays small without a scheduled job.
    await repository.delete({ userId: user.id, purpose, usedAt: IsNull() });
    await repository.delete({ userId: user.id, expiresAt: LessThan(now) });

    const token = generateToken();
    await repository.insert({
      userId: user.id,
      purpose,
      tokenHash: hashToken(token),
      email: user.email,
      expiresAt: new Date(now.getTime() + ACCOUNT_TOKEN_TTL_MS[purpose]),
      usedAt: null,
    });
    return token;
  }

  /**
   * Uses the token up and returns its account, or `null` when it can't be
   * used: unknown, another purpose, used, expired, the account is blocked,
   * or its email is no longer the one the link went to. One answer for all,
   * so a caller can't tell them apart.
   *
   * Two parallel uses of one token: exactly one gets the account. Pass the
   * caller's transaction, so a failure after this undoes the use too.
   */
  async consume(
    token: string,
    purpose: AccountTokenPurpose,
    manager: EntityManager,
  ): Promise<User | null> {
    const repository = manager.getRepository(AccountToken);
    const now = new Date();
    const stored = await repository.findOne({
      where: { tokenHash: hashToken(token), purpose },
      relations: { user: true },
    });
    if (
      !stored ||
      // A shortcut only: the conditional UPDATE below is what guarantees
      // single use, also against a parallel request.
      stored.usedAt !== null ||
      stored.expiresAt <= now ||
      stored.user.blocked ||
      !sameEmail(stored.email, stored.user.email)
    ) {
      return null;
    }

    // Postgres makes a parallel UPDATE of the same row wait for this one to
    // commit, then re-checks `used_at IS NULL`: only one of them gets the row.
    const { affected } = await repository.update(
      { id: stored.id, usedAt: IsNull() },
      { usedAt: now },
    );
    return affected ? stored.user : null;
  }
}
