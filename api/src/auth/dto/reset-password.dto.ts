import { PickType } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ChangePasswordDto } from './change-password.dto';

/** `newPassword`: the registration rules, as at change-password. */
export class ResetPasswordDto extends PickType(ChangePasswordDto, [
  'newPassword',
] as const) {
  /**
   * From the reset link (`#token=…`).
   * @example "q3Jx0bY1o7k8e5H2nqQ9sT4uV6wX8yZ0aB1cD2eF3gH"
   */
  // Any string up to a sane size: a malformed token gets the same
  // INVALID_TOKEN as an unknown one, so the client has one case to handle.
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  token: string;
}
