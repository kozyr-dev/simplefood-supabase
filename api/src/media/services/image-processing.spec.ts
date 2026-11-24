import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import {
  detectImageType,
  MAX_SIDE,
  processImage,
  type ImageType,
} from './image-processing';

/** A solid-colour test image of the given size and type. */
function image(
  width: number,
  height: number,
  type: ImageType = 'jpeg',
  channels: 3 | 4 = 3,
) {
  return sharp({
    create: {
      width,
      height,
      channels,
      background: { r: 200, g: 80, b: 40, alpha: 0.5 },
    },
  }).toFormat(type);
}

const jpeg = (width: number, height: number) => image(width, height).toBuffer();

/** A PNG whose header claims `width` × `height` (it can't really be decoded). */
async function pngClaiming(width: number, height: number): Promise<Buffer> {
  const png = await image(1, 1, 'png').toBuffer();
  // IHDR: length (4), "IHDR" (4), width (4), height (4), ... and a CRC over
  // type + data at offset 29. Bytes 8–32 of the file.
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  png.writeUInt32BE(crc32(png.subarray(12, 29)), 29);
  return png;
}

async function expectError(
  input: Buffer,
  status: number,
  code: string,
  message?: string,
) {
  const error: unknown = await processImage(input).then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toMatchObject({
    status,
    response: { code, ...(message && { message }) },
  });
}

describe('image processing', () => {
  describe('detectImageType', () => {
    it.each([
      ['jpeg', () => image(4, 4, 'jpeg').toBuffer()],
      ['png', () => image(4, 4, 'png').toBuffer()],
      ['webp', () => image(4, 4, 'webp').toBuffer()],
    ] as const)('recognises %s by its first bytes', async (type, build) => {
      expect(detectImageType(await build())).toBe(type);
    });

    it.each([
      ['SVG', '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'],
      ['HTML', '<!doctype html><script>alert(1)</script>'],
      ['GIF', 'GIF89a\u0001\u0000\u0001\u0000'],
      ['RIFF that is not WebP', 'RIFF\u0000\u0000\u0000\u0000WAVEfmt '],
      ['empty', ''],
    ])('knows nothing else: %s', (_, content) => {
      expect(detectImageType(Buffer.from(content, 'latin1'))).toBeNull();
    });
  });

  describe('processImage', () => {
    it('keeps a large photo as it is and makes every size, keeping proportions', async () => {
      const result = await processImage(await jpeg(1600, 1200));

      expect(result.type).toBe('jpeg');
      expect(result.original).toMatchObject({ width: 1600, height: 1200 });
      const sizes = Object.fromEntries(
        Object.entries(result.variants).map(([name, file]) => [
          name,
          [file.width, file.height],
        ]),
      );
      expect(sizes).toEqual({
        large: [1000, 750],
        medium: [750, 563],
        small: [500, 375],
        thumbnail: [208, 156],
      });
    });

    it('reports the real dimensions of every file it returns', async () => {
      const result = await processImage(await jpeg(1600, 1200));

      for (const file of [result.original, ...Object.values(result.variants)]) {
        const actual = await sharp(file.data).metadata();
        expect([actual.format, actual.width, actual.height]).toEqual([
          'jpeg',
          file.width,
          file.height,
        ]);
      }
    });

    it('only makes sizes smaller than the original, never enlarging', async () => {
      const middle = await processImage(await jpeg(600, 400));
      expect(Object.keys(middle.variants)).toEqual(['small', 'thumbnail']);

      const tiny = await processImage(await jpeg(200, 100));
      expect(tiny.variants).toEqual({});
      expect(tiny.original).toMatchObject({ width: 200, height: 100 });
    });

    it('fits a portrait photo in each box by its height', async () => {
      const result = await processImage(await jpeg(1200, 1600));

      expect(result.variants.large).toMatchObject({ width: 750, height: 1000 });
      expect(result.variants.thumbnail).toMatchObject({
        width: 117,
        height: 156,
      });
    });

    it(`scales the original down to ${MAX_SIDE} px on its longest side`, async () => {
      const result = await processImage(await jpeg(4000, 3000));

      expect(result.original).toMatchObject({ width: 2560, height: 1920 });
    });

    it('turns the photo upright from its EXIF orientation', async () => {
      // Stored sideways, with "rotate 90° to view" in its metadata.
      const sideways = await image(300, 200)
        .withMetadata({ orientation: 6 })
        .toBuffer();

      const result = await processImage(sideways);

      expect(result.original).toMatchObject({ width: 200, height: 300 });
      expect((await sharp(result.original.data).metadata()).orientation).toBe(
        undefined,
      );
    });

    it('removes all metadata, GPS position included, from every file', async () => {
      const photo = await image(800, 600)
        .withExif({
          IFD0: { Copyright: 'Olena Koval', Make: 'PhoneMaker' },
          IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '50/1 27/1 0/1' },
        })
        .toBuffer();
      expect(
        (await sharp(photo).metadata()).exif?.toString('latin1'),
      ).toContain('Olena Koval');

      const result = await processImage(photo);

      for (const file of [result.original, ...Object.values(result.variants)]) {
        const metadata = await sharp(file.data).metadata();
        expect(metadata.exif).toBeUndefined();
        expect(file.data.toString('latin1')).not.toContain('Olena');
        expect(file.data.toString('latin1')).not.toContain('PhoneMaker');
      }
    });

    it('keeps a PNG a PNG, transparency included', async () => {
      const result = await processImage(
        await image(600, 600, 'png', 4).toBuffer(),
      );

      expect(result.type).toBe('png');
      const metadata = await sharp(result.variants.small?.data).metadata();
      expect([metadata.format, metadata.hasAlpha]).toEqual(['png', true]);
    });

    it('accepts WebP', async () => {
      const result = await processImage(
        await image(300, 300, 'webp').toBuffer(),
      );

      expect(result.type).toBe('webp');
      expect(Object.keys(result.variants)).toEqual(['thumbnail']);
    });

    it.each([
      ['SVG', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
      ['HTML', '<html><body>hi</body></html>'],
      ['GIF', 'GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000;'],
    ])('refuses %s with 415', async (_, content) => {
      await expectError(
        Buffer.from(content, 'latin1'),
        415,
        'UNSUPPORTED_MEDIA_TYPE',
      );
    });

    it('refuses a file that only starts like a JPEG with 400', async () => {
      await expectError(
        Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(100, 7)]),
        400,
        'INVALID_IMAGE',
        'The image could not be read',
      );
    });

    it('refuses a truncated photo instead of storing it half grey', async () => {
      const full = await image(800, 600)
        .jpeg({ progressive: false })
        .toBuffer();

      await expectError(
        full.subarray(0, Math.floor(full.length / 2)),
        400,
        'INVALID_IMAGE',
        'The image could not be read',
      );
    });

    it('refuses an image over 40 megapixels before decoding it', async () => {
      await expectError(
        await pngClaiming(8000, 6000),
        400,
        'INVALID_IMAGE',
        'The image is larger than 40 megapixels',
      );
    });

    it('refuses an animation', async () => {
      // Two different frames: identical ones are merged into a still image.
      const first = await image(20, 20, 'png').toBuffer();
      const second = await image(20, 20, 'png').negate().toBuffer();
      const animated = await sharp([first, second], {
        join: { animated: true },
      })
        .webp({ loop: 0, delay: [100, 100] })
        .toBuffer();

      await expectError(
        animated,
        400,
        'INVALID_IMAGE',
        'Animated images are not accepted',
      );
    });
  });
});
