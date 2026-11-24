import { resolve } from 'node:path';
import { registerAs, type ConfigType } from '@nestjs/config';

/**
 * Media config under the `media` namespace. Inject it with
 * `@Inject(mediaConfig.KEY) config: MediaConfig`. The env schema
 * (config/env.validation.ts) has filled in the default by now.
 */
const mediaConfig = registerAs('media', () => ({
  /** Absolute: a relative UPLOADS_DIR is taken from the working directory. */
  uploadsDir: resolve(process.env.UPLOADS_DIR as string),
}));

export type MediaConfig = ConfigType<typeof mediaConfig>;

export default mediaConfig;
