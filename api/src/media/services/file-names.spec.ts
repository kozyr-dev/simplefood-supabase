import {
  displayName,
  fileNameOf,
  isSafeFileName,
  newFileBase,
  uploadUrl,
} from './file-names';

describe('media file names', () => {
  describe('isSafeFileName', () => {
    it.each(['Zx3_k-9.jpg', 'small_Zx3_k-9.png', 'large_borscht_3f9a.webp'])(
      'accepts %s',
      (name) => {
        expect(isSafeFileName(name)).toBe(true);
      },
    );

    it.each([
      ['a path', '../secret.jpg'],
      ['a folder', 'a/b.jpg'],
      ['a Windows path', 'a\\b.jpg'],
      ['a hidden file', '.abc.jpg'],
      ['a second dot', 'a.php.jpg'],
      ['another extension', 'a.svg'],
      ['an upper-case extension', 'a.JPG'],
      ['no name', '.jpg'],
      ['a space', 'a b.jpg'],
      ['a null byte', 'a\u0000.jpg'],
      ['a line break', 'a.jpg\n'],
    ])('refuses %s', (_, name) => {
      expect(isSafeFileName(name)).toBe(false);
    });
  });

  it('makes a new unguessable base each time, safe as a name', () => {
    const bases = new Set(Array.from({ length: 100 }, newFileBase));

    expect(bases.size).toBe(100);
    for (const base of bases) {
      expect(base).toMatch(/^[\w-]{22}$/);
      expect(isSafeFileName(`small_${base}.jpg`)).toBe(true);
    }
  });

  it('maps names to URLs and back', () => {
    expect(uploadUrl('abc.jpg')).toBe('/uploads/abc.jpg');
    expect(fileNameOf('/uploads/abc.jpg')).toBe('abc.jpg');
    expect(fileNameOf('/uploads/../abc.jpg')).toBeNull();
    expect(fileNameOf('/other/abc.jpg')).toBeNull();
    expect(fileNameOf('https://cdn.example.com/uploads/abc.jpg')).toBeNull();
  });

  describe('displayName', () => {
    it('keeps the name as typed, in any script', () => {
      expect(displayName('Борщ на столі.JPG')).toBe('Борщ на столі.JPG');
    });

    it('drops any path, and control and formatting characters', () => {
      expect(displayName('C:\\Users\\olena\\photo.jpg')).toBe('photo.jpg');
      expect(displayName('../../etc/passwd')).toBe('passwd');
      expect(displayName('evil\u202Egpj.exe\u0000\n')).toBe('evilgpj.exe');
    });

    it('caps it at 255 characters, never splitting one', () => {
      const name = displayName(`${'😀'.repeat(300)}.jpg`);

      expect(Array.from(name)).toHaveLength(255);
      expect(name).toBe('😀'.repeat(255));
    });

    it('falls back to "image" when nothing is left', () => {
      expect(displayName(undefined)).toBe('image');
      expect(displayName(' \u0007 ')).toBe('image');
      expect(displayName('folder/')).toBe('image');
    });
  });
});
