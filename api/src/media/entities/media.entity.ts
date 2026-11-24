import { Check, Column, Entity } from 'typeorm';
import { AppBaseEntity } from '@/database/entities/base.entity';

/** One resized variant of an image, made on upload (services/image-processing.ts). */
export interface MediaFormat {
  url: string;
  width: number;
  height: number;
}

/** Responsive variants, keyed by size name. Only images have them. */
export type MediaFormats = Partial<
  Record<'thumbnail' | 'small' | 'medium' | 'large', MediaFormat>
>;

/**
 * An uploaded image (product photos, blog images, page section images).
 * Created by MediaService: POST /api/media (also from the admin app) and the
 * Strapi import.
 */
// Named constraints: a violation then reads `violates check constraint
// "CHK_media_size_non_negative"`, not a generated hash.
@Entity()
@Check('CHK_media_size_non_negative', '"size" >= 0')
@Check('CHK_media_width_positive', '"width" IS NULL OR "width" > 0')
@Check('CHK_media_height_positive', '"height" IS NULL OR "height" > 0')
export class Media extends AppBaseEntity {
  /**
   * Relative to the API origin, e.g. `/uploads/borscht_3f9a.jpg`: the same
   * on any domain, and the frontend prefixes its API address.
   */
  @Column({ type: 'text' })
  url: string;

  /** The uploader's file name, for finding it in the admin; never used on disk. */
  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** MIME type, e.g. `image/jpeg`. */
  @Column({ type: 'varchar', length: 100 })
  mime: string;

  /** File size in bytes (Strapi stores kilobytes; converted on migration). */
  @Column({ type: 'integer' })
  size: number;

  /** Pixel dimensions; null for files that aren't images. */
  @Column({ type: 'integer', nullable: true })
  width: number | null;

  @Column({ type: 'integer', nullable: true })
  height: number | null;

  /** Alternative text for screen readers and SEO. */
  @Column({ type: 'text', nullable: true })
  alt: string | null;

  /** Optional grouping in the admin (e.g. `products`, `blog`). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  folder: string | null;

  @Column({ type: 'jsonb', nullable: true })
  formats: MediaFormats | null;
}
