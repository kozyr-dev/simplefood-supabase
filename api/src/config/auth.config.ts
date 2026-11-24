import { registerAs, type ConfigType } from '@nestjs/config';

/**
 * Auth config under the `auth` namespace. Inject it with
 * `@Inject(authConfig.KEY) config: AuthConfig`, or override `authConfig.KEY`
 * in tests (e.g. a 1-second access token).
 *
 * Reading `process.env` here is safe: ConfigModule validates it with the Joi
 * schema (config/env.validation.ts) and fills in defaults before any
 * `registerAs` factory runs.
 */
const authConfig = registerAs('auth', () => ({
  /** HS256 key for access tokens; at least 32 characters. */
  accessSecret: process.env.JWT_ACCESS_SECRET as string,
  /** Access token lifetime, in seconds. */
  accessTtl: Number(process.env.JWT_ACCESS_TTL),
  // `iss`/`aud` claims, checked on verify: a token signed with the same key
  // for another purpose or service is rejected.
  issuer: 'simplefood-api',
  audience: 'simplefood',

  /** A refresh token expires after this many days without use. */
  refreshTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS),
  /** A session (token family) ends this many days after login, used or not. */
  refreshMaxTtlDays: Number(process.env.REFRESH_TOKEN_MAX_TTL_DAYS),

  /** bcrypt cost factor; existing hashes with a lower cost are upgraded on login. */
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS),
}));

export type AuthConfig = ConfigType<typeof authConfig>;

export default authConfig;
