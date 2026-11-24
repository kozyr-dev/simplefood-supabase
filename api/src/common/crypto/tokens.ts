import { createHash, randomBytes } from 'node:crypto';

/*
 * Opaque tokens: refresh tokens, password-reset and email-verification
 * links. The client gets the token once; the database keeps only its hash,
 * so a leaked table holds nothing usable.
 */

/** 32 random bytes as base64url: 43 URL-safe characters, unguessable. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256, hex (64 characters). The token is 256 random bits, so a slow hash
 * (bcrypt) adds nothing, and a fast one lets the row be found by its hash.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
