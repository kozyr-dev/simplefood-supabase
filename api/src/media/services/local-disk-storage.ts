import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MediaStorage } from '../types/media.types';
import { isSafeFileName } from './file-names';

/** Files in one folder (UPLOADS_DIR), which configureApp() serves at /uploads. */
export class LocalDiskStorage implements MediaStorage {
  constructor(private readonly dir: string) {}

  /** Creates the folder if needed; fails at startup if it can't. */
  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  async save(name: string, data: Buffer): Promise<void> {
    const path = this.pathOf(name);
    // Written under a hidden temporary name (never served: /uploads ignores
    // dotfiles), then renamed, which is atomic within one folder.
    const temporary = join(this.dir, `.${randomBytes(8).toString('hex')}.tmp`);
    try {
      await writeFile(temporary, data, { flag: 'wx' });
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async remove(name: string): Promise<void> {
    await rm(this.pathOf(name), { force: true });
  }

  private pathOf(name: string): string {
    if (!isSafeFileName(name)) {
      throw new Error('Refused an unsafe media file name');
    }
    return join(this.dir, name);
  }
}
