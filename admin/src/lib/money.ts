/*
 * Prices are kopiykas (integers) in the API; editors see and type hryvnias.
 * Converted as text, never through floats: "19.99" is 1999, exactly.
 */

const AMOUNT = /^(\d{1,7})(?:[.,](\d{1,2}))?$/;

/** 18950 -> "189.50" (for an input); null -> "". */
export function formatHryvnias(kopiykas: unknown): string {
  if (typeof kopiykas !== 'number' || !Number.isInteger(kopiykas)) return '';
  const sign = kopiykas < 0 ? '-' : '';
  const abs = Math.abs(kopiykas);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * "189", "189.5", "189,50" -> 18900, 18950, 18950. Anything else (more than
 * two decimals, a minus, letters) comes back as typed, for
 * validateHryvnias() to refuse.
 */
export function parseHryvnias(text: string): number | string | null {
  const trimmed = text.trim().replace(/\s/g, '');
  if (!trimmed) return null;
  const match = AMOUNT.exec(trimmed);
  if (!match) return text;
  const [, whole, fraction = ''] = match;
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** react-admin validator for a parsed amount. */
export function validateHryvnias(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return typeof value === 'number'
    ? undefined
    : 'Enter an amount in hryvnias, e.g. 189 or 189.50';
}

const DISPLAY = new Intl.NumberFormat('uk-UA', {
  style: 'currency',
  currency: 'UAH',
});

/** 18950 -> "189,50 ₴" (for lists and the dashboard). */
export function displayHryvnias(kopiykas: number): string {
  return DISPLAY.format(kopiykas / 100);
}
