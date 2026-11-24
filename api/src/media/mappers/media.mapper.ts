import type { AdminMediaDto } from '../dto/admin-media.dto';
import type { MediaDto } from '../dto/media.dto';
import type { Media } from '../entities/media.entity';

/**
 * Entity -> API shape. Internal columns (mime, size, folder, timestamps) stay
 * out of responses. Every module that returns media uses this one function.
 */
export function toMediaDto(media: Media): MediaDto {
  return {
    id: media.id,
    url: media.url,
    alt: media.alt,
    width: media.width,
    height: media.height,
    formats: media.formats,
  };
}

/** For optional relations (`product.image`, ...). */
export function toMediaDtoOrNull(
  media: Media | null | undefined,
): MediaDto | null {
  return media ? toMediaDto(media) : null;
}

/** For the admin app: the public fields plus the file's details. */
export function toAdminMediaDto(media: Media): AdminMediaDto {
  return Object.assign(toMediaDto(media), {
    name: media.name,
    folder: media.folder,
    mime: media.mime,
    size: media.size,
    createdAt: media.createdAt,
  });
}
