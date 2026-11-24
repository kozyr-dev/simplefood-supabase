import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MailService } from '@/mail/services/mail.service';
import { AccountTokenPurpose } from '@/users/entities/account-token.entity';
import { toUserDto } from '@/users/mappers/user.mapper';
import { AccountEmailsService } from '@/users/services/account-emails.service';
import { AccountTokensService } from '@/users/services/account-tokens.service';
import {
  PASSWORD_MAX_BYTES,
  PasswordService,
} from '@/users/services/password.service';
import { UsersService, wrongPassword } from '@/users/services/users.service';
import { isStaff, type User } from '@/users/entities/user.entity';
import type { AuthResultDto } from '../dto/auth-result.dto';
import type { AuthTokensDto } from '../dto/auth-tokens.dto';
import type { ChangePasswordDto } from '../dto/change-password.dto';
import type { LoginDto } from '../dto/login.dto';
import type { RegisterDto } from '../dto/register.dto';
import type { ResetPasswordDto } from '../dto/reset-password.dto';
import type { AuthUser } from '../types/auth.types';
import { AccessTokensService } from './access-tokens.service';
import {
  RefreshTokensService,
  type IssuedRefreshToken,
} from './refresh-tokens.service';

/** Same answer for an unknown email and a wrong password. */
function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({
    message: 'Invalid email or password',
    code: 'INVALID_CREDENTIALS',
  });
}

/** A customer at the admin app's login. */
function notStaff(): ForbiddenException {
  return new ForbiddenException({
    message: 'This account has no access to the admin',
    code: 'NOT_STAFF',
  });
}

/**
 * A reset or verification link that can't be used: unknown, used, expired,
 * replaced by a newer one, or its account changed email or was blocked. One
 * answer for all; 400, not 401.
 */
function invalidToken(): BadRequestException {
  return new BadRequestException({
    message: 'This link is invalid or has expired',
    code: 'INVALID_TOKEN',
  });
}

/**
 * The /auth flows. Passwords are hashed before a transaction starts (bcrypt
 * takes ~200 ms at cost 12; no connection is held meanwhile).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly accessTokens: AccessTokensService,
    private readonly refreshTokens: RefreshTokensService,
    private readonly accountTokens: AccountTokensService,
    private readonly accountEmails: AccountEmailsService,
    private readonly mail: MailService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Creates a customer and logs them in; a verification link goes to the
   * email after the commit. 409 for a taken email.
   */
  async register({
    name,
    email,
    password,
    phone,
  }: RegisterDto): Promise<AuthResultDto> {
    const passwordHash = await this.passwords.hash(password);
    // One transaction: no account is left behind if issuing the session or
    // the verification token fails.
    const { user, result, verificationToken } =
      await this.dataSource.transaction(async (manager) => {
        const created = await this.users.create(
          { name, email, passwordHash, phone: phone ?? null },
          manager,
        );
        return {
          user: created,
          result: await this.result(
            created,
            await this.refreshTokens.issue(created.id, manager),
          ),
          verificationToken: await this.accountTokens.issue(
            created,
            AccountTokenPurpose.EmailVerification,
            manager,
          ),
        };
      });
    this.accountEmails.emailVerification(user.email, verificationToken);
    return result;
  }

  async login(dto: LoginDto): Promise<AuthResultDto> {
    const user = await this.checkCredentials(dto);
    return this.result(user, await this.refreshTokens.issue(user.id));
  }

  /**
   * The admin app's login: as login(), for staff only. A customer gets a
   * 403 `NOT_STAFF`, only after the right password (like a blocked
   * account), and no session is started.
   */
  async staffLogin(dto: LoginDto): Promise<AuthResultDto> {
    const user = await this.checkCredentials(dto);
    if (!isStaff(user.role)) {
      throw notStaff();
    }
    return this.result(user, await this.refreshTokens.issue(user.id));
  }

  /** A new token pair for a valid refresh token; 401 otherwise. */
  async refresh(refreshToken: string): Promise<AuthTokensDto> {
    const rotated = await this.refreshTokens.rotate(refreshToken);
    return this.tokens(rotated.user, rotated.refreshToken);
  }

  /**
   * The admin app's refresh: as refresh(), plus the account, which the app
   * shows after a page reload. An account no longer staff gets a 403
   * `NOT_STAFF`, and the session ends.
   */
  async staffRefresh(refreshToken: string): Promise<AuthResultDto> {
    const { user, refreshToken: next } =
      await this.refreshTokens.rotate(refreshToken);
    if (!isStaff(user.role)) {
      await this.refreshTokens.revokeFamily(next.token);
      throw notStaff();
    }
    return this.result(user, next);
  }

  /** Ends the token's session. Unknown tokens are ignored. */
  logout(refreshToken: string): Promise<void> {
    return this.refreshTokens.revokeFamily(refreshToken);
  }

  /**
   * Sets a new password and ends every session, this one included; the
   * caller continues with the new pair. Access tokens already issued stay
   * valid until they expire.
   */
  async changePassword(
    caller: AuthUser,
    { currentPassword, newPassword }: ChangePasswordDto,
  ): Promise<AuthResultDto> {
    // 401 if deleted or blocked since the access token was issued.
    const user = await this.users.findActiveWithPassword(caller.id);
    // 400, not 401: the frontend answers any 401 with a token refresh.
    if (!(await this.passwords.verify(currentPassword, user.passwordHash))) {
      throw wrongPassword();
    }

    const passwordHash = await this.passwords.hash(newPassword);
    const result = await this.dataSource.transaction(async (manager) => {
      await this.users.setPassword(user.id, passwordHash, manager);
      await this.refreshTokens.revokeAllForUser(user.id, manager);
      return this.result(
        user,
        await this.refreshTokens.issue(user.id, manager),
      );
    });
    this.accountEmails.passwordChanged(user.email);
    return result;
  }

  /**
   * Emails a reset link if an active account has this email. Returns at
   * once, whatever the email: the lookup and the sending run in the
   * background, so neither the answer nor its timing tells whether the
   * account exists.
   */
  requestPasswordReset(email: string): void {
    this.mail.defer('password-reset', async () => {
      const user = await this.users.findByEmail(email);
      if (!user || user.blocked) {
        return;
      }
      const token = await this.accountTokens.issue(
        user,
        AccountTokenPurpose.PasswordReset,
      );
      // To the stored address, in its stored case, not the one typed.
      this.accountEmails.passwordReset(user.email, token);
    });
  }

  /**
   * Sets a new password from a reset link, in one transaction: the link is
   * used up, every session ends (a thief's too), and the email counts as
   * verified (the link proved the mailbox). Doesn't log in (OWASP): the
   * client sends the user to the login form. Access tokens already issued
   * stay valid until they expire. A notice follows, as after a change.
   */
  async resetPassword({ token, newPassword }: ResetPasswordDto): Promise<void> {
    const passwordHash = await this.passwords.hash(newPassword);
    const user = await this.dataSource.transaction(async (manager) => {
      const owner = await this.accountTokens.consume(
        token,
        AccountTokenPurpose.PasswordReset,
        manager,
      );
      if (!owner) {
        throw invalidToken();
      }
      await this.users.setPassword(owner.id, passwordHash, manager);
      await this.users.markEmailVerified(owner.id, manager);
      await this.refreshTokens.revokeAllForUser(owner.id, manager);
      return owner;
    });
    this.accountEmails.passwordChanged(user.email);
  }

  /**
   * Marks the email verified with the token from a verification link. No
   * login needed: the link may be opened on another device.
   */
  async verifyEmail(token: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const user = await this.accountTokens.consume(
        token,
        AccountTokenPurpose.EmailVerification,
        manager,
      );
      if (!user) {
        throw invalidToken();
      }
      await this.users.markEmailVerified(user.id, manager);
    });
  }

  /**
   * A new verification link for the caller's email, cancelling earlier
   * ones. Nothing is sent once the email is verified; the answer is the
   * same either way. 401 if the account was deleted or blocked meanwhile.
   */
  async resendVerification(caller: AuthUser): Promise<void> {
    const user = await this.users.findActive(caller.id);
    if (user.emailVerifiedAt) {
      return;
    }
    const token = await this.accountTokens.issue(
      user,
      AccountTokenPurpose.EmailVerification,
    );
    this.accountEmails.emailVerification(user.email, token);
  }

  /**
   * The account behind a correct email and password: 401
   * `INVALID_CREDENTIALS` otherwise, 403 `ACCOUNT_BLOCKED` for a blocked one.
   * Upgrades a weak hash on the way.
   */
  private async checkCredentials({ email, password }: LoginDto): Promise<User> {
    const user = await this.users.findByEmailWithPassword(email);
    const hash = user?.passwordHash;
    // Unknown users are checked against a dummy hash: same time, same 401.
    const matches = await this.passwords.verify(password, hash);
    if (!user || !hash || !matches) {
      throw invalidCredentials();
    }
    // Only after the right password: don't tell strangers an account is blocked.
    if (user.blocked) {
      throw new ForbiddenException({
        message: 'This account is blocked',
        code: 'ACCOUNT_BLOCKED',
      });
    }

    // Strapi's cost-10 hashes are upgraded while the password is at hand.
    // A legacy password over 72 bytes can't be re-hashed: bcrypt only ever
    // used its first 72 bytes, and hash() refuses the rest.
    if (
      this.passwords.needsRehash(hash) &&
      Buffer.byteLength(password, 'utf8') <= PASSWORD_MAX_BYTES
    ) {
      await this.users.setPassword(
        user.id,
        await this.passwords.hash(password),
      );
    }

    return user;
  }

  private async tokens(
    user: User,
    refreshToken: IssuedRefreshToken,
  ): Promise<AuthTokensDto> {
    return {
      accessToken: await this.accessTokens.sign({
        id: user.id,
        role: user.role,
      }),
      expiresIn: this.accessTokens.ttlSeconds,
      refreshToken: refreshToken.token,
      refreshTokenExpiresAt: refreshToken.expiresAt,
    };
  }

  private async result(
    user: User,
    refreshToken: IssuedRefreshToken,
  ): Promise<AuthResultDto> {
    return Object.assign(await this.tokens(user, refreshToken), {
      user: toUserDto(user),
    });
  }
}
