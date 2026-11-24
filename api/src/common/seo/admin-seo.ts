import type { Repository } from 'typeorm';
import type { Seo } from '@/database/entities/seo.embedded';
import type { Media } from '@/media/entities/media.entity';
import { loadReference } from '../admin/references';
import type { AdminSeoDto, SeoInputDto } from './seo-input.dto';

/** Embedded `Seo` -> the admin's flat shape (load `seo.shareImage` first). */
export function toAdminSeoDto(seo: Seo | null | undefined): AdminSeoDto {
  return {
    title: seo?.title ?? null,
    description: seo?.description ?? null,
    shareImageId: seo?.shareImage?.id ?? null,
  };
}

/**
 * Applies the fields sent to `seo`, in place: missing ones stay, `null`
 * clears, an unknown image is a 400 (`seo.shareImageId`). Empty texts count
 * as none.
 */
export async function applySeoInput(
  seo: Seo,
  input: SeoInputDto | undefined,
  media: Repository<Media>,
): Promise<void> {
  if (!input) return;
  if (input.title !== undefined) seo.title = input.title?.trim() || null;
  if (input.description !== undefined) {
    seo.description = input.description?.trim() || null;
  }
  const image = await loadReference(
    media,
    input.shareImageId,
    'seo.shareImageId',
  );
  if (image !== undefined) seo.shareImage = image;
}
