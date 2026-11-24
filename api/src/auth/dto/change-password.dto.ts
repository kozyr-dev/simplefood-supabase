import {
  IsByteLength,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
} from '@/users/services/password.service';
import { PASSWORD_BYTES_MESSAGE } from './register.dto';

export class ChangePasswordDto {
  /**
   * Checked like a login password (no length rules).
   * @example "correct horse battery"
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  currentPassword: string;

  /**
   * Same rules as at registration: 8 characters or more, at most 72 bytes.
   * @example "battery staple horse"
   */
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @IsByteLength(0, PASSWORD_MAX_BYTES, { message: PASSWORD_BYTES_MESSAGE })
  newPassword: string;
}
