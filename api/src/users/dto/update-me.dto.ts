import { PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { UserFieldsDto } from './user-fields.dto';

/**
 * PATCH /users/me: only the fields sent change. `null` clears `phone` or
 * `address`; for `name` and `email` it's a 400
 * (`skipNullProperties: false` keeps validating null).
 *
 * No `role` or `blocked`: `forbidNonWhitelisted` refuses them with 400.
 */
export class UpdateMeDto extends PartialType(UserFieldsDto, {
  skipNullProperties: false,
}) {
  /**
   * Required to change the email: otherwise a stolen access token could
   * move the account to another address and reset its password from there.
   * Checked whenever it's sent.
   * @example "correct horse battery"
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  currentPassword?: string;
}
