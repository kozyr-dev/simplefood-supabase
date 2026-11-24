export class AuthTokensDto {
  /**
   * Send as `Authorization: Bearer <accessToken>`.
   * @example "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   */
  accessToken: string;

  /**
   * Seconds until the access token expires; refresh before or when a call
   * returns 401.
   * @example 900
   */
  expiresIn: number;

  /**
   * Single use: `/auth/refresh` replaces it. Keep it out of reach of page
   * scripts where possible.
   * @example "q3Jx0bY1o7k8e5H2nqQ9sT4uV6wX8yZ0aB1cD2eF3gH"
   */
  refreshToken: string;

  /** When the refresh token expires if it isn't used (at most 7 days). */
  refreshTokenExpiresAt: Date;
}
