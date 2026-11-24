import { randomBytes } from 'node:crypto';
import { UPLOADS_PATH } from '../types/media.types';

/**
 * A stored file's name: letters, digits, `_` and `-`, then an image
 * extension. No dots or slashes before it, so a name can never leave the
 * uploads folder or be a hidden file. Imported Strapi names fit too.
 */
const SAFE_FILE_NAME = /^[A-Za-z0-9_-]+\.(?:jpg|png|webp)$/;

export function isSafeFileName(name: string): boolean {
  return SAFE_FILE_NAME.test(name);
}

/**
 * A new, unguessable base for one upload's files (128 random bits,
 * base64url): `<base>.jpg`, `small_<base>.jpg`, ...
 */
export function newFileBase(): string {
  return randomBytes(16).toString('base64url');
}

/** `/uploads/<name>`. */
export function uploadUrl(name: string): string {
  return `${UPLOADS_PATH}/${name}`;
}

/** The stored file behind a `/uploads/...` URL, or null if it isn't one. */
export function fileNameOf(url: string): string | null {
  const prefix = `${UPLOADS_PATH}/`;
  if (!url.startsWith(prefix)) return null;
  const name = url.slice(prefix.length);
  return isSafeFileName(name) ? name : null;
}

const MAX_NAME_LENGTH = 255;

/**
 * The name the uploader's file had, for finding it again in the admin:
 * without any path, control or formatting characters, at most 255
 * characters. Never used on disk.
 */
export function displayName(original: string | undefined): string {
  const base = (original ?? '').split(/[/\\]/).pop() ?? '';
  const cleaned = base
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim();
  // By code point, as Postgres counts varchar(255).
  return Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join('') || 'image';
}
