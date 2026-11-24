import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VerifyEmailDto {
  /**
   * From the verification link (`#token=…`).
   * @example "q3Jx0bY1o7k8e5H2nqQ9sT4uV6wX8yZ0aB1cD2eF3gH"
   */
  // As in ResetPasswordDto: a malformed token gets INVALID_TOKEN too.
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  token: string;
}
