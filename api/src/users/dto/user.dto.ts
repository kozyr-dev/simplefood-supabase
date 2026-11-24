import { UserRole } from '../entities/user.entity';

/** The account as its owner sees it. Never the password hash or `blocked`. */
export class UserDto {
  /** @example "019a1b2c-3d4e-7f50-8a6b-7c8d9e0f1a2b" */
  id: string;

  /** @example "Ivan Petrenko" */
  name: string;

  /** @example "ivan@example.com" */
  email: string;

  /**
   * Whether the owner opened a verification (or password-reset) link sent
   * to `email`. A new email starts unverified. Nothing requires it yet.
   * @example true
   */
  emailVerified: boolean;

  /** @example "+380 67 123 45 67" */
  phone: string | null;

  /** @example "Kyiv, Khreshchatyk St, 1" */
  address: string | null;

  /** @example "customer" */
  role: UserRole;

  createdAt: Date;
}
