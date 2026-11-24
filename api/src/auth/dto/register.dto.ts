import { PickType } from '@nestjs/swagger';
import { IsByteLength, IsString, MinLength } from 'class-validator';
import { UserFieldsDto } from '@/users/dto/user-fields.dto';
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
} from '@/users/services/password.service';

/**
 * bcrypt ignores bytes after the 72nd, so a longer password is refused
 * instead of silently cut. Cyrillic letters take 2 bytes, emoji 4.
 */
export const PASSWORD_BYTES_MESSAGE = `$property must be at most ${PASSWORD_MAX_BYTES} bytes in UTF-8 (fewer characters with non-Latin letters or emoji)`;

/*
 * No `role`: registration always creates a customer. The global
 * ValidationPipe has `forbidNonWhitelisted`, so a body that sends one is
 * rejected with 400 instead of being ignored.
 */
export class RegisterDto extends PickType(UserFieldsDto, [
  'name',
  'email',
  'phone',
] as const) {
  /**
   * 8 characters or more, at most 72 bytes in UTF-8.
   * @example "correct horse battery"
   */
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @IsByteLength(0, PASSWORD_MAX_BYTES, { message: PASSWORD_BYTES_MESSAGE })
  password: string;
}
