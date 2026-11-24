import validationSchema from './env.validation';

/** The smallest environment the app accepts. */
const minimalEnv = {
  NODE_ENV: 'production',
  DB_HOST: 'db.internal',
  DB_USER: 'app',
  DB_PASSWORD: 'secret',
  DB_NAME: 'simplefood',
  CORS_ORIGINS: 'https://simplefood.kozyr.info',
  JWT_ACCESS_SECRET: 'kO3n9vB1xQ7mZ2pL5sT8wY4cF6hJ0dGa',
  SMTP_HOST: 'smtp.example.com',
  MAIL_FROM: 'noreply@simplefood.kozyr.info',
  MAIL_NOTIFY_TO: 'shop@simplefood.kozyr.info',
  FRONTEND_URL: 'https://simplefood.kozyr.info',
};

// Same options @nestjs/config uses by default.
const validate = (env: Record<string, unknown>) =>
  validationSchema.validate(env, { allowUnknown: true, abortEarly: false });

const errorKeys = (env: Record<string, unknown>) =>
  validate(env).error?.details.map((detail) => detail.context?.key) ?? [];

describe('env validation schema', () => {
  it('accepts the minimal environment and fills in the defaults', () => {
    const { error, value } = validate(minimalEnv);

    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      PORT: 1339,
      DB_PORT: 5432,
      SWAGGER_ENABLED: false,
      JWT_ACCESS_TTL: 900,
      REFRESH_TOKEN_TTL_DAYS: 7,
      REFRESH_TOKEN_MAX_TTL_DAYS: 30,
      BCRYPT_ROUNDS: 12,
      TRUST_PROXY_HOPS: 0,
      SMTP_PORT: 587,
      SMTP_SECURE: false,
      UPLOADS_DIR: 'uploads',
    });
    expect(value.LOG_LEVEL).toBeUndefined(); // logger.config picks per NODE_ENV
  });

  it.each([
    'NODE_ENV',
    'DB_HOST',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'CORS_ORIGINS',
    'JWT_ACCESS_SECRET',
    'SMTP_HOST',
    'MAIL_FROM',
    'MAIL_NOTIFY_TO',
    'FRONTEND_URL',
  ])('requires %s', (key) => {
    const env: Record<string, unknown> = { ...minimalEnv };
    delete env[key];

    expect(errorKeys(env)).toEqual([key]);
  });

  it('reports every problem at once, not just the first', () => {
    expect(errorKeys({ NODE_ENV: 'staging' })).toEqual(
      expect.arrayContaining([
        'NODE_ENV',
        'DB_HOST',
        'DB_USER',
        'DB_PASSWORD',
        'DB_NAME',
        'CORS_ORIGINS',
        'JWT_ACCESS_SECRET',
        'SMTP_HOST',
        'MAIL_FROM',
        'MAIL_NOTIFY_TO',
        'FRONTEND_URL',
      ]),
    );
  });

  it.each([
    ['NODE_ENV', 'staging'],
    ['PORT', 'abc'],
    ['PORT', '70000'],
    ['DB_PORT', '0'],
    ['DB_HOST', 'not a host!'],
    ['LOG_LEVEL', 'verbose'],
    ['LOG_LEVEL', 'INFO'],
    ['SWAGGER_ENABLED', 'maybe'],
    ['JWT_ACCESS_SECRET', 'x'.repeat(31)],
    ['JWT_ACCESS_TTL', '59'],
    ['JWT_ACCESS_TTL', '90.5'],
    ['REFRESH_TOKEN_TTL_DAYS', '0'],
    ['BCRYPT_ROUNDS', '16'],
    ['TRUST_PROXY_HOPS', '-1'],
    ['SMTP_HOST', 'smtp server'],
    ['SMTP_PORT', '0'],
    ['SMTP_SECURE', 'maybe'],
    ['MAIL_FROM', 'SimpleFood <noreply@simplefood.kozyr.info>'],
    ['MAIL_NOTIFY_TO', 'shop'],
    ['FRONTEND_URL', 'simplefood.kozyr.info'],
    ['FRONTEND_URL', 'ftp://simplefood.kozyr.info'],
  ])('rejects %s=%s', (key, value) => {
    expect(errorKeys({ ...minimalEnv, [key]: value })).toEqual([key]);
  });

  it('converts numbers and booleans from their string form', () => {
    const { value } = validate({
      ...minimalEnv,
      PORT: '8080',
      DB_PORT: '5433',
      SWAGGER_ENABLED: 'true',
    });

    expect(value).toMatchObject({
      PORT: 8080,
      DB_PORT: 5433,
      SWAGGER_ENABLED: true,
    });
  });

  describe('auth', () => {
    it('requires the session lifetime to be at least the idle lifetime', () => {
      expect(
        errorKeys({
          ...minimalEnv,
          REFRESH_TOKEN_TTL_DAYS: '14',
          REFRESH_TOKEN_MAX_TTL_DAYS: '7',
        }),
      ).toEqual(['REFRESH_TOKEN_MAX_TTL_DAYS']);
    });

    it('checks the session lifetime against the idle default too', () => {
      expect(
        errorKeys({ ...minimalEnv, REFRESH_TOKEN_MAX_TTL_DAYS: '6' }),
      ).toEqual(['REFRESH_TOKEN_MAX_TTL_DAYS']);
    });

    it.each([
      ['test', '4', true],
      ['development', '4', true],
      ['production', '4', false],
      ['production', '9', false],
      ['production', '10', true],
      ['test', '3', false],
    ])('NODE_ENV=%s, BCRYPT_ROUNDS=%s: accepted = %s', (env, rounds, ok) => {
      expect(
        errorKeys({ ...minimalEnv, NODE_ENV: env, BCRYPT_ROUNDS: rounds }),
      ).toEqual(ok ? [] : ['BCRYPT_ROUNDS']);
    });

    const placeholder = 'dev-only-change-me-dev-only-change-me';

    it('refuses the .env.example placeholder secret in production', () => {
      expect(
        errorKeys({ ...minimalEnv, JWT_ACCESS_SECRET: placeholder }),
      ).toEqual(['JWT_ACCESS_SECRET']);
    });

    it('never prints the secret in an error message', () => {
      const tooShort = 'Zx81-not-long-enough';
      const messages = [placeholder, tooShort].flatMap(
        (secret) =>
          validate({
            ...minimalEnv,
            JWT_ACCESS_SECRET: secret,
          }).error?.details.map((detail) => detail.message) ?? [],
      );

      expect(messages).toHaveLength(2);
      for (const message of messages) {
        expect(message).not.toContain(placeholder);
        expect(message).not.toContain(tooShort);
      }
    });

    it('accepts the placeholder secret in development', () => {
      expect(
        errorKeys({
          ...minimalEnv,
          NODE_ENV: 'development',
          JWT_ACCESS_SECRET: placeholder,
        }),
      ).toEqual([]);
    });
  });

  describe('mail', () => {
    it('accepts SMTP credentials as a pair', () => {
      expect(
        validate({ ...minimalEnv, SMTP_USER: 'api', SMTP_PASSWORD: 'secret' })
          .error,
      ).toBeUndefined();
    });

    it.each([
      ['a user without a password', { SMTP_USER: 'api' }],
      ['a password without a user', { SMTP_PASSWORD: 'secret' }],
    ])('refuses %s, without printing it', (_, credentials) => {
      const { error } = validate({ ...minimalEnv, ...credentials });

      expect(error?.details.map((detail) => detail.type)).toEqual([
        'object.and',
      ]);
      expect(error?.message).not.toContain('secret');
    });

    it.each([
      ['production', 'http://simplefood.kozyr.info', false],
      ['production', 'https://simplefood.kozyr.info', true],
      ['development', 'http://localhost:3000', true],
      ['test', 'http://localhost:3000', true],
    ])('NODE_ENV=%s, FRONTEND_URL=%s: accepted = %s', (env, url, ok) => {
      expect(
        errorKeys({ ...minimalEnv, NODE_ENV: env, FRONTEND_URL: url }),
      ).toEqual(ok ? [] : ['FRONTEND_URL']);
    });
  });

  it('ignores variables it does not know (e.g. POSTGRES_* for Docker Compose)', () => {
    expect(
      validate({ ...minimalEnv, POSTGRES_PORT: '5433' }).error,
    ).toBeUndefined();
  });
});
