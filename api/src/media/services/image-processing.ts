import {
  BadRequestException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import sharp, { type Sharp, type SharpOptions } from 'sharp';

/** The image types accepted, with the MIME type and extension they're stored with. */
export const IMAGE_TYPES = {
  jpeg: { mime: 'image/jpeg', extension: 'jpg' },
  png: { mime: 'image/png', extension: 'png' },
  webp: { mime: 'image/webp', extension: 'webp' },
} as const;

export type ImageType = keyof typeof IMAGE_TYPES;

/**
 * Larger images are refused before decoding: a small file can declare
 * huge dimensions and take gigabytes of memory to decode (a "decompression
 * bomb"). 40 megapixels is beyond any phone camera's default.
 */
export const MAX_INPUT_PIXELS = 40_000_000;

/** The stored original's longest side; bigger uploads are scaled down. */
export const MAX_SIDE = 2560;

/**
 * Smaller copies, with Strapi's names and sizes (the frontend reads
 * `formats.medium`, and imported Strapi files match). Each fits inside its
 * box, keeping the proportions, and is only made when the original is
 * bigger than the box.
 */
export const VARIANTS = [
  { name: 'large', width: 1000, height: 1000 },
  { name: 'medium', width: 750, height: 750 },
  { name: 'small', width: 500, height: 500 },
  { name: 'thumbnail', width: 245, height: 156 },
] as const;

export type VariantName = (typeof VARIANTS)[number]['name'];

export interface ImageFile {
  data: Buffer;
  width: number;
  height: number;
}

export interface ProcessedImage {
  type: ImageType;
  original: ImageFile;
  variants: Partial<Record<VariantName, ImageFile>>;
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/**
 * The type from the file's first bytes, never from its name or the type
 * the client claims. Anything else (SVG, GIF, HEIC, HTML, ...) never
 * reaches an image decoder.
 */
export function detectImageType(data: Buffer): ImageType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8) {
    return data[2] === 0xff ? 'jpeg' : null;
  }
  if (data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'png';
  }
  if (
    data.length >= 12 &&
    data.toString('latin1', 0, 4) === 'RIFF' &&
    data.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

function unsupportedType(): UnsupportedMediaTypeException {
  return new UnsupportedMediaTypeException({
    message: 'Only JPEG, PNG and WebP images are accepted',
    code: 'UNSUPPORTED_MEDIA_TYPE',
  });
}

function invalidImage(message: string): BadRequestException {
  return new BadRequestException({ message, code: 'INVALID_IMAGE' });
}

/**
 * Decoding limits for every read of an upload. `truncated`: a cut-off file
 * is refused instead of stored half grey; harmless warnings (common in
 * phone photos) are tolerated.
 */
const INPUT: SharpOptions = {
  limitInputPixels: MAX_INPUT_PIXELS,
  failOn: 'truncated',
};

/** Re-encoding settings per type: good quality at a web-friendly size. */
function encode(image: Sharp, type: ImageType): Promise<ImageFile> {
  const encoded =
    type === 'jpeg'
      ? image.jpeg({ quality: 82, mozjpeg: true })
      : type === 'png'
        ? image.png({ compressionLevel: 9 })
        : image.webp({ quality: 82 });
  return encoded
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => ({
      data,
      width: info.width,
      height: info.height,
    }));
}

/**
 * Checks an upload and builds what gets stored: the original, turned
 * upright (EXIF orientation), at most MAX_SIDE, **with all metadata
 * removed** (phone photos carry the GPS position where they were taken),
 * plus the VARIANTS. Same type as the upload.
 *
 * 415 `UNSUPPORTED_MEDIA_TYPE` for anything but JPEG, PNG and WebP;
 * 400 `INVALID_IMAGE` for a damaged, animated or oversized image.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const type = detectImageType(input);
  if (!type) {
    throw unsupportedType();
  }

  // Reads the header only, decoding nothing, so the size can be checked
  // here with a clear message (with INPUT's limit, sharp would refuse it as
  // unreadable).
  const metadata = await sharp(input)
    .metadata()
    .catch(() => {
      throw invalidImage('The image could not be read');
    });
  if (metadata.format !== type) {
    throw invalidImage('The image could not be read');
  }
  if ((metadata.pages ?? 1) > 1) {
    throw invalidImage('Animated images are not accepted');
  }
  if (metadata.width * metadata.height > MAX_INPUT_PIXELS) {
    throw invalidImage('The image is larger than 40 megapixels');
  }

  // The full decode: a damaged file fails here. sharp drops all metadata
  // on output unless told to keep it.
  const original = await encode(
    sharp(input, INPUT)
      .autoOrient()
      .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true }),
    type,
  ).catch(() => {
    throw invalidImage('The image could not be read');
  });

  // From the upload, not the re-encoded original: a JPEG is compressed once.
  // It decoded fine above, so an error here is ours (a 500), not the upload's.
  const variants: ProcessedImage['variants'] = {};
  for (const { name, width, height } of VARIANTS) {
    if (original.width > width || original.height > height) {
      variants[name] = await encode(
        sharp(input, INPUT)
          .autoOrient()
          .resize(width, height, { fit: 'inside' }),
        type,
      );
    }
  }

  return { type, original, variants };
}
