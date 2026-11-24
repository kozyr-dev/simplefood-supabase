/*
 * Small conversions from Strapi's stored values to ours. Strapi on SQLite
 * keeps datetimes as epoch milliseconds, decimals as floats, money in
 * hryvnias and file sizes in kilobytes.
 */

/** A SQLite text or number as text. Anything else means a wrong column: an error. */
export function sqlText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  throw new Error(
    `Expected a text value, got ${value === null ? 'null' : typeof value}`,
  );
}

/** A Strapi datetime (epoch ms, or an ISO string in older rows); null stays null. */
export function strapiDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const text = sqlText(value);
  const date = new Date(/^\d+$/.test(text) ? Number(text) : text);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Not a Strapi datetime: ${text}`);
  }
  return date;
}

/** Hryvnias (a float, e.g. 189.5) → kopiykas (18950), rounded to the kopiyka. */
export function toKopiykas(hryvnias: number): number {
  return Math.round(hryvnias * 100);
}

/** Strapi's kilobytes (a float) → bytes. */
export function kilobytesToBytes(kilobytes: number): number {
  return Math.round(kilobytes * 1024);
}

/** Text, or null when it's missing or only whitespace (Strapi stores both). */
export function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.trim() === '' ? null : value;
}

/** SQLite booleans are 0/1 (or null). */
export function strapiBoolean(value: unknown): boolean {
  return value === 1 || value === true || value === '1';
}

/**
 * Strapi pre-fills a file's alt text with its file name, which tells a
 * screen reader nothing ("IMG_2041.jpg"): that counts as no alt text.
 */
export function altText(alt: unknown, fileName: string): string | null {
  const text = textOrNull(alt);
  return text === null || text.trim() === fileName.trim() ? null : text.trim();
}

/**
 * A Strapi upload folder name as our `folder` (lower-case letters, digits
 * and hyphens): "Products" → "products". Null when nothing usable is left.
 */
export function folderName(name: string | null): string | null {
  if (name === null) return null;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return slug === '' ? null : slug;
}
