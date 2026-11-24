import type { Seo } from '@/database/entities/seo.embedded';
import { toMediaDtoOrNull } from '@/media/mappers/media.mapper';
import type { SeoDto } from './seo.dto';

/**
 * Embedded `Seo` columns -> API shape. Shared by settings, blog and pages.
 * Load `seo.shareImage` first, or it comes out as null.
 */
export function toSeoDto(seo: Seo | null | undefined): SeoDto {
  return {
    title: seo?.title ?? null,
    description: seo?.description ?? null,
    shareImage: toMediaDtoOrNull(seo?.shareImage),
  };
}
