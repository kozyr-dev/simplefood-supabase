import authConfig from './auth.config';

// As the env schema leaves it: validated, but still strings.
const AUTH_ENV = {
  JWT_ACCESS_SECRET: 'kO3n9vB1xQ7mZ2pL5sT8wY4cF6hJ0dGa',
  JWT_ACCESS_TTL: '600',
  REFRESH_TOKEN_TTL_DAYS: '7',
  REFRESH_TOKEN_MAX_TTL_DAYS: '30',
  BCRYPT_ROUNDS: '4',
};

/** Runs the config factory with the given env, then restores the env. */
function buildWith(env: Record<string, string>) {
  const saved = Object.fromEntries(
    Object.keys(env).map((key) => [key, process.env[key]]),
  );
  try {
    Object.assign(process.env, env);
    return authConfig();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('auth config', () => {
  it('reads the auth variables, as numbers where they are numbers', () => {
    expect(buildWith(AUTH_ENV)).toEqual({
      accessSecret: 'kO3n9vB1xQ7mZ2pL5sT8wY4cF6hJ0dGa',
      accessTtl: 600,
      issuer: 'simplefood-api',
      audience: 'simplefood',
      refreshTtlDays: 7,
      refreshMaxTtlDays: 30,
      bcryptRounds: 4,
    });
  });
});
