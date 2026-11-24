import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  IsNull,
  QueryFailedError,
  type EntityManager,
  type Repository,
} from 'typeorm';
import type { UpdateMeDto } from '../dto/update-me.dto';
import type { UserDto } from '../dto/user.dto';
import { AccountTokenPurpose } from '../entities/account-token.entity';
import { sameEmail } from '../entities/email';
import { User, type UserRole } from '../entities/user.entity';
import { toUserDto } from '../mappers/user.mapper';
import { AccountEmailsService } from './account-emails.service';
import { AccountTokensService } from './account-tokens.service';
import { PasswordService } from './password.service';

export interface NewUser {
  name: string;
  email: string;
  passwordHash: string;
  phone?: string | null;
  /** A customer unless given (staff accounts come from `admin:create`). */
  role?: UserRole;
  /** Unverified unless given. */
  emailVerifiedAt?: Date | null;
}

/** The email's unique constraint: the only one on accounts (names repeat). */
const EMAIL_UNIQUE = 'UQ_user_email';

/**
 * The token's user no longer exists or was blocked since it was issued: the
 * guard's 401, so the client refreshes, which then fails and logs it out.
 */
function noLongerActive(): UnauthorizedException {
  return new UnauthorizedException('Authentication required');
}

/** Same code as a wrong password at change-password (400: see D13). */
export function wrongPassword(): BadRequestException {
  return new BadRequestException({
    message: 'Current password is incorrect',
    code: 'WRONG_PASSWORD',
  });
}

/**
 * User accounts and the caller's own profile. Knows nothing about sessions
 * (AuthModule's tokens); a new email gets a verification link from here.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly passwords: PasswordService,
    private readonly accountTokens: AccountTokensService,
    private readonly accountEmails: AccountEmailsService,
    private readonly dataSource: DataSource,
  ) {}

  /** The caller's account; 401 if it was deleted or blocked meanwhile. */
  async getProfile(id: string): Promise<UserDto> {
    return toUserDto(await this.findActive(id));
  }

  /**
   * The account behind an access token; 401 if it was deleted or blocked
   * since the token was issued (access tokens can't be revoked).
   */
  async findActive(id: string): Promise<User> {
    const user = await this.users.findOneBy({ id });
    if (!user || user.blocked) {
      throw noLongerActive();
    }
    return user;
  }

  /**
   * Changes the fields sent. A new email needs the current password; a sent
   * `currentPassword` is checked either way. A taken email is a 409, as at
   * registration.
   *
   * A new address is unverified: after the commit it gets a verification
   * link, and the old address a notice. A change of letter case only is the
   * same address (citext): it stays verified, and nothing is sent.
   */
  async updateProfile(
    id: string,
    { currentPassword, ...changes }: UpdateMeDto,
  ): Promise<UserDto> {
    const user = await this.findActiveWithPassword(id);
    const oldEmail = user.email;

    const emailChanges =
      changes.email !== undefined && changes.email !== oldEmail;
    if (emailChanges && currentPassword === undefined) {
      throw new BadRequestException({
        message: 'Changing the email requires currentPassword',
        code: 'CURRENT_PASSWORD_REQUIRED',
      });
    }
    if (
      currentPassword !== undefined &&
      !(await this.passwords.verify(currentPassword, user.passwordHash))
    ) {
      throw wrongPassword();
    }

    // `changes` holds only the keys sent. Nothing sent, nothing written: an
    // empty update would still bump updated_at.
    if (!Object.keys(changes).length) {
      return toUserDto(user);
    }
    const newEmail =
      changes.email !== undefined && !sameEmail(changes.email, oldEmail)
        ? changes.email
        : null;
    const update: Partial<User> = newEmail
      ? { ...changes, emailVerifiedAt: null }
      : changes;

    const verificationToken = await this.dataSource.transaction(
      async (manager) => {
        try {
          await manager.getRepository(User).update(id, update);
        } catch (error) {
          throw toConflict(error) ?? error;
        }
        return newEmail
          ? this.accountTokens.issue(
              { id, email: newEmail },
              AccountTokenPurpose.EmailVerification,
              manager,
            )
          : null;
      },
    );

    if (newEmail && verificationToken) {
      this.accountEmails.emailVerification(newEmail, verificationToken);
      this.accountEmails.emailChanged(oldEmail);
    }
    return toUserDto(Object.assign(user, update));
  }

  /**
   * With `passwordHash`, for checking the password of a logged-in user;
   * 401 if the account was deleted or blocked since the token was issued.
   */
  async findActiveWithPassword(id: string): Promise<User> {
    const user = await this.withPassword()
      .where('user.id = :id', { id })
      .getOne();
    if (!user || user.blocked) {
      throw noLongerActive();
    }
    return user;
  }

  /** For login: by email, in any letter case (citext). Loads `passwordHash`. */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.withPassword().where('user.email = :email', { email }).getOne();
  }

  /**
   * Inserts an account (a customer unless `role` says otherwise). A
   * duplicate email becomes a 409 `EMAIL_TAKEN`. The database decides, not
   * a lookup first: two parallel registrations can't both pass.
   */
  async create(
    data: NewUser,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<User> {
    const repository = manager.getRepository(User);
    try {
      const user = await repository.save(
        repository.create({ phone: null, emailVerifiedAt: null, ...data }),
      );
      delete user.passwordHash;
      return user;
    } catch (error) {
      throw toConflict(error) ?? error;
    }
  }

  /** By email, in any letter case (citext); `null` if there's no such account. */
  findByEmail(email: string): Promise<User | null> {
    return this.users.findOneBy({ email });
  }

  /** The owner proved they read mail at the account's address. Kept if already set. */
  async markEmailVerified(
    id: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    await manager
      .getRepository(User)
      .update(
        { id, emailVerifiedAt: IsNull() },
        { emailVerifiedAt: new Date() },
      );
  }

  async setPassword(
    id: string,
    passwordHash: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    await manager.getRepository(User).update(id, { passwordHash });
  }

  /**
   * Access tokens already issued keep the old role until they expire; the
   * next refresh reads the new one.
   */
  async setRole(
    id: string,
    role: UserRole,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    await manager.getRepository(User).update(id, { role });
  }

  private withPassword() {
    return this.users.createQueryBuilder('user').addSelect('user.passwordHash');
  }
}

/** A ConflictException for a duplicate email, else null. */
function toConflict(error: unknown): ConflictException | null {
  if (!(error instanceof QueryFailedError)) return null;
  const { code, constraint } = error.driverError as {
    code?: string;
    constraint?: string;
  };
  return code === '23505' && constraint === EMAIL_UNIQUE
    ? new ConflictException({
        code: 'EMAIL_TAKEN',
        message: 'An account with this email already exists',
      })
    : null;
}
