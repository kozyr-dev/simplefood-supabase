import { ConflictException } from '@nestjs/common';
import { PickType } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { flattenValidationErrors } from '@/common/validation/flatten-validation-errors';
import { UserFieldsDto } from '../dto/user-fields.dto';
import { UserRole } from '../entities/user.entity';
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  type PasswordService,
} from '../services/password.service';
import type { UsersService } from '../services/users.service';

/*
 * Creating staff accounts and changing their role, for the `admin:create`
 * command: registration only ever makes customers, and the admin app needs
 * a first admin to log in with. The same rules as registration apply.
 */

export type StaffRole = UserRole.Admin | UserRole.Editor;

export interface StaffAccountServices {
  users: UsersService;
  passwords: PasswordService;
}

export interface NewStaffAccount {
  name: string;
  email: string;
  password: string;
  role: StaffRole;
}

/** A reason the command refuses, worded for the person running it. */
export class StaffAccountError extends Error {
  override name = 'StaffAccountError';
}

class StaffFieldsDto extends PickType(UserFieldsDto, [
  'name',
  'email',
] as const) {}

/**
 * Creates a staff account. Its email counts as verified: the operator
 * typed it in. Throws StaffAccountError for invalid fields, a weak or
 * over-long password, or a taken email.
 */
export async function createStaffAccount(
  { users, passwords }: StaffAccountServices,
  { name, email, password, role }: NewStaffAccount,
): Promise<void> {
  // Trimmed like every request body (TrimPipe); the password never is.
  const fields = plainToInstance(StaffFieldsDto, {
    name: name.trim(),
    email: email.trim(),
  });
  const errors = await validate(fields, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length) {
    throw new StaffAccountError(
      flattenValidationErrors(errors)
        .details.flatMap(({ messages }) => messages)
        .join('; '),
    );
  }
  checkPassword(password);

  try {
    await users.create({
      name: fields.name,
      email: fields.email,
      passwordHash: await passwords.hash(password),
      role,
      emailVerifiedAt: new Date(),
    });
  } catch (error) {
    if (error instanceof ConflictException) {
      throw new StaffAccountError(error.message);
    }
    throw error;
  }
}

/**
 * Gives the account with this email a staff role. False when it already
 * had it. Throws StaffAccountError for an unknown email or a blocked
 * account (unblock it first, deliberately).
 */
export async function setStaffRole(
  { users }: Pick<StaffAccountServices, 'users'>,
  email: string,
  role: StaffRole,
): Promise<boolean> {
  const user = await users.findByEmail(email.trim());
  if (!user) {
    throw new StaffAccountError('No account has this email');
  }
  if (user.blocked) {
    throw new StaffAccountError('This account is blocked');
  }
  if (user.role === role) {
    return false;
  }
  await users.setRole(user.id, role);
  return true;
}

/** The registration rules: 8 characters or more, at most 72 bytes. */
function checkPassword(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new StaffAccountError(
      `The password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    );
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    throw new StaffAccountError(
      `The password must be at most ${PASSWORD_MAX_BYTES} bytes in UTF-8 ` +
        '(fewer characters with non-Latin letters or emoji)',
    );
  }
}
