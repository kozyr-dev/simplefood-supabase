import { Column, ManyToOne } from 'typeorm';
import { Media } from '@/media/entities/media.entity';

/**
 * Search-engine and social-sharing metadata, embedded in settings, pages and
 * blog posts (columns `seo_title`, `seo_description`, `seo_share_image_id`).
 */
export class Seo {
  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  /**
   * Open Graph image for link previews. Deleting the file just clears it.
   * Optional because it's a relation: `undefined` unless the query loads
   * it (`relations: { seo: { shareImage: true } }`).
   */
  @ManyToOne(() => Media, { nullable: true, onDelete: 'SET NULL' })
  shareImage?: Media | null;
}
