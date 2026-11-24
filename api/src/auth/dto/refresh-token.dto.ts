import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Body of `/auth/refresh` and `/auth/logout`. */
export class RefreshTokenDto {
  /**
   * The refresh token from login, registration or the last refresh.
   * @example "q3Jx0bY1o7k8e5H2nqQ9sT4uV6wX8yZ0aB1cD2eF3gH"
   */
  // Any string up to a sane size: a malformed token (or an access token sent
  // by mistake) gets the same 401 as an unknown one.
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  refreshToken: string;
}
