import {
  altText,
  folderName,
  kilobytesToBytes,
  strapiBoolean,
  strapiDate,
  textOrNull,
  toKopiykas,
} from './values';

describe('Strapi value conversions', () => {
  describe('strapiDate', () => {
    it('reads epoch milliseconds, as a number or text', () => {
      expect(strapiDate(1668437014362)?.toISOString()).toBe(
        '2022-11-14T14:43:34.362Z',
      );
      expect(strapiDate('1668437014362')?.toISOString()).toBe(
        '2022-11-14T14:43:34.362Z',
      );
    });

    it('reads ISO strings', () => {
      expect(strapiDate('2024-03-01T10:00:00.000Z')?.toISOString()).toBe(
        '2024-03-01T10:00:00.000Z',
      );
    });

    it('keeps a missing date missing', () => {
      expect(strapiDate(null)).toBeNull();
      expect(strapiDate(undefined)).toBeNull();
    });

    it('refuses garbage instead of storing an invalid date', () => {
      expect(() => strapiDate('yesterday')).toThrow(
        'Not a Strapi datetime: yesterday',
      );
    });
  });

  it.each([
    [189, 18900],
    [189.5, 18950],
    [19.99, 1999], // 19.99 * 100 is 1998.9999999999998 in floating point
    [0, 0],
  ])('converts %d UAH to %d kopiykas', (hryvnias, kopiykas) => {
    expect(toKopiykas(hryvnias)).toBe(kopiykas);
  });

  it('converts kilobytes to whole bytes', () => {
    expect(kilobytesToBytes(236.95)).toBe(242637);
    expect(kilobytesToBytes(0)).toBe(0);
  });

  it('treats empty and whitespace-only text as none', () => {
    expect(textOrNull('')).toBeNull();
    expect(textOrNull('  \n')).toBeNull();
    expect(textOrNull(null)).toBeNull();
    expect(textOrNull(7)).toBeNull();
    expect(textOrNull(' Борщ ')).toBe(' Борщ ');
  });

  it('reads SQLite booleans', () => {
    expect(strapiBoolean(1)).toBe(true);
    expect(strapiBoolean(0)).toBe(false);
    expect(strapiBoolean(null)).toBe(false);
  });

  describe('altText', () => {
    it('drops the file name Strapi fills in by default', () => {
      expect(altText('IMG_2041.jpg', 'IMG_2041.jpg')).toBeNull();
    });

    it('keeps a real description', () => {
      expect(altText(' Борщ зі сметаною ', 'IMG_2041.jpg')).toBe(
        'Борщ зі сметаною',
      );
    });

    it('treats a missing one as none', () => {
      expect(altText(null, 'a.jpg')).toBeNull();
      expect(altText('', 'a.jpg')).toBeNull();
    });
  });

  it.each([
    ['Products', 'products'],
    ['Blog posts', 'blog-posts'],
    ['  Акції 2024 ', '2024'],
    ['Галерея', null],
    [null, null],
  ])('turns the folder %p into %p', (name, folder) => {
    expect(folderName(name)).toBe(folder);
  });
});
