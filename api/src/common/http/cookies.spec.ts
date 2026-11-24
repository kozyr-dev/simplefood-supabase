import { expiredCookie, readCookie, serializeCookie } from './cookies';

describe('cookies', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('serializeCookie', () => {
    it('writes every attribute asked for', () => {
      jest.useFakeTimers({ now: Date.UTC(2026, 10, 11, 12, 0, 0) });

      expect(
        serializeCookie('sid', 'abc-DEF_123', {
          path: '/api/admin/auth',
          expires: new Date(Date.UTC(2026, 10, 18, 12, 0, 0)),
          httpOnly: true,
          secure: true,
          sameSite: 'Strict',
        }),
      ).toBe(
        'sid=abc-DEF_123; Path=/api/admin/auth; ' +
          'Expires=Wed, 18 Nov 2026 12:00:00 GMT; Max-Age=604800; ' +
          'HttpOnly; Secure; SameSite=Strict',
      );
    });

    it('leaves out the attributes not asked for', () => {
      expect(serializeCookie('sid', 'x', { path: '/' })).toBe('sid=x; Path=/');
    });

    it('never writes a negative Max-Age for a date in the past', () => {
      expect(
        serializeCookie('sid', 'x', { path: '/', expires: new Date(0) }),
      ).toContain('Max-Age=0');
    });

    it.each([
      ['a value with a semicolon', 'sid', 'a;b'],
      ['a value with a space', 'sid', 'a b'],
      ['a value with a comma', 'sid', 'a,b'],
      ['a value with a quote', 'sid', 'a"b'],
      ['a name with "="', 's=id', 'x'],
      ['an empty name', '', 'x'],
    ])('refuses %s instead of writing a broken header', (_, name, value) => {
      expect(() => serializeCookie(name, value, { path: '/' })).toThrow(
        'characters that need escaping',
      );
    });
  });

  it('expiredCookie empties the cookie and dates it in 1970', () => {
    expect(
      expiredCookie('sid', { path: '/a', httpOnly: true, sameSite: 'Strict' }),
    ).toBe(
      'sid=; Path=/a; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; ' +
        'HttpOnly; SameSite=Strict',
    );
  });

  describe('readCookie', () => {
    it.each([
      ['the only cookie', 'sid=abc', 'abc'],
      ['among others', 'theme=dark; sid=abc; lang=uk', 'abc'],
      ['without spaces', 'theme=dark;sid=abc', 'abc'],
      ['with "=" in the value', 'sid=a=b', 'a=b'],
      ['the first of duplicates', 'sid=new; sid=old', 'new'],
      ['an empty value', 'sid=', ''],
    ])('finds %s', (_, header, value) => {
      expect(readCookie(header, 'sid')).toBe(value);
    });

    it.each([
      ['no header', undefined],
      ['an empty header', ''],
      ['other cookies only', 'theme=dark; lang=uk'],
      ['a name that only ends with it', 'xsid=abc'],
      ['a name that only starts with it', 'sid2=abc'],
      ['a pair without "="', 'sid'],
    ])('returns undefined for %s', (_, header) => {
      expect(readCookie(header, 'sid')).toBeUndefined();
    });
  });
});
