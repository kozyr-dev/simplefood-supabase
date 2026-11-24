import { resolve } from 'node:path';
import mediaConfig from './media.config';

describe('media config', () => {
  const saved = process.env.UPLOADS_DIR;

  afterEach(() => {
    if (saved === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = saved;
  });

  it('makes a relative UPLOADS_DIR absolute, from the working directory', () => {
    process.env.UPLOADS_DIR = 'uploads';

    expect(mediaConfig().uploadsDir).toBe(resolve(process.cwd(), 'uploads'));
  });

  it('keeps an absolute UPLOADS_DIR', () => {
    process.env.UPLOADS_DIR = '/srv/simplefood/uploads';

    expect(mediaConfig().uploadsDir).toBe('/srv/simplefood/uploads');
  });
});
