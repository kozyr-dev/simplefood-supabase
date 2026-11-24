import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AppBaseEntity } from '@/database/entities/base.entity';
import { User } from './user.entity';

/** What a link in an email lets its holder do. */
export enum AccountTokenPurpose {
  PasswordReset = 'password_reset',
  EmailVerification = 'email_verification',
}

/**
 * A single-use token sent by email (a password-reset or verification link).
 * Only its SHA-256 hash is stored, never the token.
 *
 * Bound to the address it was sent to: it only works while the account
 * still has that email, so changing the email cancels every link already
 * sent to the old one.
 */
@Entity()
@Unique('UQ_account_token_hash', ['tokenHash'])
// "This user's tokens for this purpose": cancelling older links, cleanup.
// Also serves the foreign key when a user is deleted.
@Index('IDX_account_token_user_purpose', ['userId', 'purpose'])
export class AccountToken extends AppBaseEntity {
  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** The `user_id` column itself. */
  @Column({ type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: AccountTokenPurpose,
    enumName: 'account_token_purpose',
  })
  purpose: AccountTokenPurpose;

  /** SHA-256 of the token, hex. The unique index is also the lookup index. */
  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  /** The address the link was sent to; citext, like the account's email. */
  @Column({ type: 'citext' })
  email: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  /** Set when the link is used; it never works again. */
  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;
}
