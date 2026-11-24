import * as Joi from 'joi';

const validationSchema = Joi.object({
  // Required, no default: a production deploy that forgets it must fail here,
  // not run with development settings (pretty logs need the dev-only pino-pretty).
  NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),
  PORT: Joi.number().port().default(1339),
  // Pino log level. Optional: when unset, config/logger.config.ts picks one per
  // NODE_ENV (test: silent, development: debug, production: info).
  LOG_LEVEL: Joi.string().valid(
    'fatal',
    'error',
    'warn',
    'info',
    'debug',
    'trace',
    'silent',
  ),
  // Read by the `database` namespace in config/database.config.ts.
  DB_HOST: Joi.string().hostname().required(),
  // min(1): port() allows 0 ("any free port"), valid to listen on, not to connect to.
  DB_PORT: Joi.number().port().min(1).default(5432),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  // Comma-separated list, e.g. "http://localhost:3000,https://simplefood.kozyr.info".
  // Required on purpose: no permissive fallback if it is forgotten in production.
  CORS_ORIGINS: Joi.string().required(),
  // Swagger UI at /api/docs. Off by default: the docs list the whole API surface.
  SWAGGER_ENABLED: Joi.boolean().default(false),
  // Read by the `auth` namespace in config/auth.config.ts.
  // HS256 key for access tokens; generate with `openssl rand -base64 48`.
  // Production refuses the .env.example placeholder (it contains "change-me").
  JWT_ACCESS_SECRET: Joi.string()
    .min(32)
    .required()
    .when('NODE_ENV', {
      is: 'production',
      // `then` is Joi's API here, not a thenable (a Promise-like object).
      // oxlint-disable-next-line unicorn/no-thenable
      then: Joi.string().pattern(/change-me/i, { invert: true }),
    })
    // Joi's default message would print the value, i.e. the secret.
    .messages({
      'string.pattern.invert.base':
        '"JWT_ACCESS_SECRET" is the .env.example placeholder; generate a real secret',
    }),
  // Access token lifetime in seconds. Short: access tokens can't be revoked.
  JWT_ACCESS_TTL: Joi.number().integer().min(60).default(900),
  // A refresh token expires after this many days without use...
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).default(7),
  // ...and a session ends this many days after login, used or not.
  REFRESH_TOKEN_MAX_TTL_DAYS: Joi.number()
    .integer()
    .min(Joi.ref('REFRESH_TOKEN_TTL_DAYS'))
    .default(30),
  // bcrypt cost: each +1 doubles the time per hash (12 is ~250 ms). 4 is
  // bcrypt's minimum, for fast tests only; production needs at least 10.
  BCRYPT_ROUNDS: Joi.number()
    .integer()
    .min(4)
    .max(15)
    .default(12)
    .when('NODE_ENV', {
      is: 'production',
      // oxlint-disable-next-line unicorn/no-thenable
      then: Joi.number().min(10),
    }),
  // Reverse proxies (nginx, ...) in front of the API, for Express's
  // `trust proxy`: the client IP (rate limits, logs) is read from
  // X-Forwarded-For only this many hops deep. 0: the header is ignored, as it
  // can be forged by anyone who reaches the API directly.
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).default(0),
  // Read by the `mail` namespace in config/mail.config.ts. Locally: Mailpit.
  SMTP_HOST: Joi.string().hostname().required(),
  SMTP_PORT: Joi.number().port().min(1).default(587),
  // true: TLS from the first byte (usually port 465). false: STARTTLS, which
  // production then requires (mail.config.ts), so it can't fall back to plain text.
  SMTP_SECURE: Joi.boolean().default(false),
  // Both or neither (see .and() below); Mailpit needs none.
  SMTP_USER: Joi.string(),
  SMTP_PASSWORD: Joi.string(),
  // Sender address; the display name "SimpleFood" is set in code.
  MAIL_FROM: Joi.string().email().required(),
  // The shop's inbox: new orders and contact messages.
  MAIL_NOTIFY_TO: Joi.string().email().required(),
  // The site's address, for links in emails (password reset, verification).
  FRONTEND_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required()
    .when('NODE_ENV', {
      is: 'production',
      // oxlint-disable-next-line unicorn/no-thenable
      then: Joi.string().uri({ scheme: ['https'] }),
    }),
  // Read by the `media` namespace in config/media.config.ts: where uploaded
  // images are stored and served from (/uploads). Relative to the working
  // directory; in Docker, mount a volume here or uploads die with the container.
  UPLOADS_DIR: Joi.string().default('uploads'),
  // The built admin app (api/admin/dist), served at /admin when it exists.
  // Relative to the working directory, like UPLOADS_DIR.
  ADMIN_DIST_DIR: Joi.string().default('admin/dist'),
}).and('SMTP_USER', 'SMTP_PASSWORD');

export default validationSchema;
