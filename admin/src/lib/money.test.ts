import { describe, expect, it } from 'vitest';
import {
  displayHryvnias,
  formatHryvnias,
  parseHryvnias,
  validateHryvnias,
} from './money';

describe('money', () => {
  it.each([
    ['189', 18900],
    ['189.5', 18950],
    ['189,50', 18950],
    ['19.99', 1999],
    ['0', 0],
    [' 1 250.00 ', 125000],
    ['0.01', 1],
  ])('parses %j as %d kopiykas, exactly', (text, kopiykas) => {
    expect(parseHryvnias(text)).toBe(kopiykas);
  });

  it.each(['1.999', '-1', '1e3', 'абв', '1.2.3', '12345678'])(
    'leaves %j as typed, for the validator to refuse',
    (text) => {
      expect(parseHryvnias(text)).toBe(text);
      expect(validateHryvnias(parseHryvnias(text))).toMatch(/hryvnias/);
    },
  );

  it('treats an empty input as no amount', () => {
    expect(parseHryvnias('  ')).toBeNull();
    expect(validateHryvnias(null)).toBeUndefined();
  });

  it.each([
    [18950, '189.50'],
    [1999, '19.99'],
    [5, '0.05'],
    [0, '0.00'],
    [null, ''],
  ])('formats %j for the input as %j', (kopiykas, text) => {
    expect(formatHryvnias(kopiykas)).toBe(text);
  });

  it('round-trips every amount', () => {
    for (const kopiykas of [0, 1, 99, 100, 1999, 18950, 9999999]) {
      expect(parseHryvnias(formatHryvnias(kopiykas))).toBe(kopiykas);
    }
  });

  it('displays Ukrainian currency', () => {
    expect(displayHryvnias(18950)).toBe('189,50 ₴');
  });
});
