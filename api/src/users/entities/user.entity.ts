import { Check, Column, Entity, Unique } from 'typeorm';
import { AppBaseEntity } from '@/database/entities/base.entity';

export enum UserRole {
  Customer = 'customer',
  Editor = 'editor',
  Admin = 'admin',
}

/** The shop's staff: the roles that may sign in to the admin app. */
export const STAFF_ROLES: readonly UserRole[] = [
  UserRole.Admin,
  UserRole.Editor,
];

export function isStaff(role: UserRole): boolean {
  return STAFF_ROLES.includes(role);
}

/**
 * Not `user`: that's a reserved word in Postgres (`SELECT * FROM user`
 * returns the current database role).
 *
 * The checks repeat the DTO rules for writers that skip the DTOs (the data
 * migration, the admin CLI). The email is the only unique field and the
 * only way to log in; the name is just a name.
 */
@Entity('app_user')
@Unique('UQ_user_email', ['email'])
@Check(
  'CHK_app_user_email',
  `char_length("email") <= 254 AND position('@' in "email") > 1`,
)
@Check('CHK_app_user_name', `char_length("name") BETWEEN 2 AND 100`)
export class User extends AppBaseEntity {
  /**
   * The person's name, shown in the UI and offered at checkout. Not unique:
   * two customers may share one. Strapi's usernames became these names.
   */
  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** citext (EnableCitext migration): `Ivan@Mail.com` and `ivan@mail.com` are one account. */
  @Column({ type: 'citext' })
  email: string;

  /**
   * bcrypt (Strapi's `$2a$10$` hashes included). `select: false`: loaded only
   * when asked for (`addSelect('user.passwordHash')`), so it can't reach a
   * response by accident; hence optional, like any column that isn't loaded.
   */
  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash?: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address: string | null;

  /** Registration always creates customers; only admins grant other roles. */
  @Column({
    type: 'enum',
    enum: UserRole,
    enumName: 'user_role',
    default: UserRole.Customer,
  })
  role: UserRole;

  /** Blocked users can't log in or refresh; their sessions are revoked. */
  @Column({ type: 'boolean', default: false })
  blocked: boolean;

  /**
   * When the owner proved they read mail at `email` (a verification or
   * password-reset link); `null` until then, and again after an email change.
   */
  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;
}
