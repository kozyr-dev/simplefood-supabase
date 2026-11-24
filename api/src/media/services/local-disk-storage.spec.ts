import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalDiskStorage } from './local-disk-storage';

describe('LocalDiskStorage', () => {
  let root: string;
  let dir: string;
  let storage: LocalDiskStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'simplefood-storage-'));
    dir = join(root, 'nested', 'uploads');
    storage = new LocalDiskStorage(dir);
    await storage.init();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('creates its folder, then saves and removes files', async () => {
    await storage.save('abc.jpg', Buffer.from('image bytes'));

    expect(await readFile(join(dir, 'abc.jpg'), 'utf8')).toBe('image bytes');
    // No temporary file is left behind.
    expect(await readdir(dir)).toEqual(['abc.jpg']);

    await storage.remove('abc.jpg');
    expect(await readdir(dir)).toEqual([]);
  });

  it('treats removing a missing file as done', async () => {
    await expect(storage.remove('missing.jpg')).resolves.toBeUndefined();
  });

  it.each(['../escape.jpg', '.hidden.jpg', 'a/b.jpg', 'page.html'])(
    'refuses the name %s, writing nothing',
    async (name) => {
      await expect(storage.save(name, Buffer.from('x'))).rejects.toThrow(
        'Refused an unsafe media file name',
      );
      await expect(storage.remove(name)).rejects.toThrow();
      expect(await readdir(root)).toEqual(['nested']);
      expect(await readdir(dir)).toEqual([]);
    },
  );
});
