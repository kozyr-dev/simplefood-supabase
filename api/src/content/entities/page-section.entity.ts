import { Check, Column, Entity, Index, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '@/database/entities/base.entity';
import { Page } from './page.entity';
import type { SectionData } from './section-data';

/** The kinds of page sections; each has its own `data` shape (section-data.ts). */
export enum SectionType {
  ImageBanner = 'image-banner',
  Products = 'products',
  Benefits = 'benefits',
  Articles = 'articles',
  ImageGallery = 'image-gallery',
  Video = 'video',
  News = 'news',
  Content = 'content',
  Contact = 'contact',
  Promo = 'promo',
}

/**
 * One block of a page. What it shows lives in `data` (jsonb), whose shape
 * depends on `type`. References to other rows (media, products, categories)
 * are stored there as ids and resolved on read. jsonb can't have foreign
 * keys, so a referenced row may be gone: readers must cope with that.
 */
@Entity()
@Check('CHK_page_section_data_object', `jsonb_typeof("data") = 'object'`)
export class PageSection extends AppBaseEntity {
  /** Sections always belong to a page and are deleted with it. */
  @Index('IDX_page_section_page')
  @ManyToOne(() => Page, (page) => page.sections, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  page: Page;

  // Not unique per page: drag-reordering in the admin updates rows one at a
  // time, so two sections briefly share a position. `id` breaks ties.
  /** Display order within the page: lower first. */
  @Column({ type: 'integer', default: 0 })
  position: number;

  @Column({ type: 'enum', enum: SectionType, enumName: 'page_section_type' })
  type: SectionType;

  /**
   * Per-type content. Always check it with validateSectionData() before
   * saving: the database only knows it's a JSON object. Loaded back as a
   * plain object, not a class instance.
   */
  @Column({ type: 'jsonb' })
  data: SectionData;
}
