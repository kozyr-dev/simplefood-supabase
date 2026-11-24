import type { INestApplication } from '@nestjs/common';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import mediaConfig, { type MediaConfig } from '@/config/media.config';

/**
 * A solid-colour image to upload, e.g. `testImage(1600, 1200)` or
 * `testImage(300, 300, 'png')`.
 */
export function testImage(
  width: number,
  height: number,
  type: 'jpeg' | 'png' | 'webp' = 'jpeg',
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 80, b: 40 },
    },
  })
    .toFormat(type)
    .toBuffer();
}

/** This app's uploads folder (UPLOADS_DIR: one per Jest worker). */
export function uploadsDir(app: INestApplication): string {
  return app.get<MediaConfig>(mediaConfig.KEY).uploadsDir;
}

/**
 * Empties the uploads folder; call it in `beforeEach` next to
 * resetDatabase() in files that upload.
 */
export async function emptyUploads(app: INestApplication): Promise<void> {
  const dir = uploadsDir(app);
  for (const name of await readdir(dir)) {
    await rm(join(dir, name), { recursive: true, force: true });
  }
}

/** The files in the uploads folder, sorted; hidden ones too. */
export async function storedFiles(app: INestApplication): Promise<string[]> {
  return (await readdir(uploadsDir(app))).sort();
}
