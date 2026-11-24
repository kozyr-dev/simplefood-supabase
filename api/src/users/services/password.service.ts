import { randomBytes } from 'node:crypto';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import bcrypt from 'bcrypt';
import authConfig, { type AuthConfig } from '@/config/auth.config';

/** For the DTOs: new passwords need at least this many characters. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * bcrypt ignores every byte after the 72nd (bytes, not characters: a
 * Cyrillic letter takes 2, an emoji 4), so longer passwords would be checked
 * only in part. DTOs reject them with `@IsByteLength(0, PASSWORD_MAX_BYTES)`.
 */
export const PASSWORD_MAX_BYTES = 72;

/**
 * Hashes and checks passwords with bcrypt at the configured cost
 * (BCRYPT_ROUNDS). Accepts the `$2a$10$` hashes migrated from Strapi;
 * `needsRehash()` tells login to upgrade them to the current cost.
 */
@Injectable()
export class PasswordService implements OnModuleInit {
  /**
   * Checked instead when there is no stored hash (unknown user), so "no such
   * user" takes as long as "wrong password" and response times don't reveal
   * which emails are registered.
   */
  private dummyHash: string;

  constructor(@Inject(authConfig.KEY) private readonly config: AuthConfig) {}

  // At startup, so the first login doesn't pay for it. The password is random
  // and thrown away: nothing can ever match this hash.
  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash(randomBytes(32).toString('base64url'));
  }

  async hash(password: string): Promise<string> {
    // DTOs already reject this; a caller that skipped them must not get a
    // hash that silently ignores the end of the password.
    if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
      throw new Error(
        `Password longer than ${PASSWORD_MAX_BYTES} bytes reached PasswordService.hash()`,
      );
    }
    return bcrypt.hash(password, this.config.bcryptRounds);
  }

  /**
   * `hash` is null/undefined for an unknown user: the dummy hash is checked
   * anyway (same work, same time), and the answer is always false.
   */
  async verify(
    password: string,
    hash: string | null | undefined,
  ): Promise<boolean> {
    const matches = await bcrypt.compare(password, hash ?? this.dummyHash);
    return matches && hash != null;
  }

  /**
   * True when the hash was made with a lower cost than the current one (e.g.
   * Strapi's 10). Call it after a successful verify(), then store hash(password).
   */
  needsRehash(hash: string): boolean {
    try {
      return bcrypt.getRounds(hash) < this.config.bcryptRounds;
    } catch {
      // Not a bcrypt hash at all: replacing it is the only fix.
      return true;
    }
  }
}
