/** Where uploaded files are served: `/uploads/<name>`, outside the /api prefix. */
export const UPLOADS_PATH = '/uploads';

/** Injection token for the MediaStorage in use (local disk; S3 later). */
export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

/**
 * Where uploaded files live. Names come from MediaService (random, see
 * services/file-names.ts); an implementation refuses any other kind.
 */
export interface MediaStorage {
  /** Stores `data` under `name`; readers never see a half-written file. */
  save(name: string, data: Buffer): Promise<void>;
  /** Removes `name`. A file that isn't there is not an error. */
  remove(name: string): Promise<void>;
}
