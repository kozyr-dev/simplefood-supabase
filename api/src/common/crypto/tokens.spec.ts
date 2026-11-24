import { createHash } from 'node:crypto';
import { generateToken, hashToken } from './tokens';

describe('opaque tokens', () => {
  it('generates 32 random bytes as 43 URL-safe characters', () => {
    const token = generateToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('never repeats itself', () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateToken));

    expect(tokens.size).toBe(1000);
  });

  it('hashes with SHA-256 to 64 hex characters, the same every time', () => {
    const token = generateToken();

    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(hashToken(token)).not.toBe(hashToken(generateToken()));
  });
});
