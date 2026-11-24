import mailConfig from './mail.config';

// As the env schema leaves it: validated, but still strings.
const MAIL_ENV = {
  NODE_ENV: 'development',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_SECURE: 'false',
  MAIL_FROM: 'noreply@example.com',
  MAIL_NOTIFY_TO: 'shop@example.com',
  FRONTEND_URL: 'http://localhost:3000',
};

const KEYS = [...Object.keys(MAIL_ENV), 'SMTP_USER', 'SMTP_PASSWORD'];

/** Runs the config factory with exactly the given env, then restores the env. */
function buildWith(env: Record<string, string>) {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of KEYS) delete process.env[key];
    Object.assign(process.env, env);
    return mailConfig();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('mail config', () => {
  it('reads the mail variables; no login without SMTP_USER', () => {
    expect(buildWith(MAIL_ENV)).toEqual({
      host: 'localhost',
      port: 1025,
      secure: false,
      requireTLS: false,
      auth: undefined,
      from: 'noreply@example.com',
      notifyTo: 'shop@example.com',
      frontendUrl: 'http://localhost:3000',
    });
  });

  it('passes the SMTP login when it is set', () => {
    expect(
      buildWith({ ...MAIL_ENV, SMTP_USER: 'api', SMTP_PASSWORD: 'secret' })
        .auth,
    ).toEqual({ user: 'api', pass: 'secret' });
  });

  it.each([
    ['development', 'false', { secure: false, requireTLS: false }],
    ['production', 'false', { secure: false, requireTLS: true }],
    ['production', 'true', { secure: true, requireTLS: false }],
    // Joi accepts any case, and ConfigModule keeps the raw text.
    ['production', 'TRUE', { secure: true, requireTLS: false }],
  ])(
    'NODE_ENV=%s, SMTP_SECURE=%s: never plain text in production',
    (env, secure, expected) => {
      expect(
        buildWith({ ...MAIL_ENV, NODE_ENV: env, SMTP_SECURE: secure }),
      ).toMatchObject(expected);
    },
  );
});
