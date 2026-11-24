import { escapeHtml, formatMoney, layout } from './format';

const NBSP = ' ';

describe('email template helpers', () => {
  describe('escapeHtml', () => {
    it('escapes everything that could open a tag or leave an attribute', () => {
      expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
        '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;',
      );
    });

    it('leaves ordinary text alone, Cyrillic included', () => {
      expect(escapeHtml('Іван Петренко, кв. 5')).toBe('Іван Петренко, кв. 5');
    });

    it('escapes an existing entity again, so it shows as typed', () => {
      expect(escapeHtml('&lt;')).toBe('&amp;lt;');
    });
  });

  describe('formatMoney', () => {
    it.each([
      [18900, `189,00${NBSP}₴`],
      [5, `0,05${NBSP}₴`],
      [0, `0,00${NBSP}₴`],
      [1234567, `12${NBSP}345,67${NBSP}₴`],
    ])('%i kopiykas → %s', (kopiykas, text) => {
      expect(formatMoney(kopiykas)).toBe(text);
    });
  });

  describe('layout', () => {
    it('escapes the title and keeps the body as given', () => {
      const html = layout('Нове <замовлення>', '<p>Тіло</p>');

      expect(html).toContain('<title>Нове &lt;замовлення&gt;</title>');
      expect(html).toContain('<p>Тіло</p>');
      expect(html).toMatch(/^<!doctype html>\n<html lang="uk">/);
      expect(html).toContain('<meta charset="utf-8">');
    });
  });
});
