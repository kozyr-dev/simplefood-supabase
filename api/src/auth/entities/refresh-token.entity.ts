import { Column, Entity, Index, ManyToOne, Unique } from 'typeorm';
import { AppBaseEntity } from '@/database/entities/base.entity';
import { User } from '@/users/entities/user.entity';

/**
 * One refresh token. Every refresh replaces it with a new row in the same
 * family; a family is one login session (one device), from login to logout
 * or expiry. Only the token's SHA-256 hash is stored, never the token.
 *
 * Revoked rows are kept until their family expires: a revoked token that
 * comes back means it was copied, and the whole family is then revoked
 * (reuse detection).
 *
 * The admin app's sessions are refresh tokens too (in a cookie, see
 * AdminAuthController).
 */
@Entity()
@Unique('UQ_refresh_token_hash', ['tokenHash'])
export class RefreshToken extends AppBaseEntity {
  /** "Revoke everything of this user" (password change, block). */
  @Index('IDX_refresh_token_user')
  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  user: User;

  /** Same for every token of one login; "revoke the session" uses it. */
  @Index('IDX_refresh_token_family')
  @Column({ type: 'uuid' })
  familyId: string;

  /** SHA-256 of the token, hex. The unique index is also the lookup index. */
  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  /** Idle expiry: refresh time + REFRESH_TOKEN_TTL_DAYS, never past familyExpiresAt. */
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  /** Login time + REFRESH_TOKEN_MAX_TTL_DAYS; copied to every token of the family. */
  @Column({ type: 'timestamptz' })
  familyExpiresAt: Date;

  /** Set when the token is used (rotated), logged out or revoked. */
  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
