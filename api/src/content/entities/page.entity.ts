import { Column, Entity, OneToMany, Unique } from 'typeorm';
import { AppBaseEntity } from '@/database/entities/base.entity';
import { Seo } from '@/database/entities/seo.embedded';
import { PageSection } from './page-section.entity';

/** The homepage is simply the page with this slug: `GET /api/pages/home`. */
export const HOME_PAGE_SLUG = 'home';

@Entity()
@Unique('UQ_page_slug', ['slug'])
export class Page extends AppBaseEntity {
  /** URL path segment, e.g. `about-us`; `home` is the homepage. */
  @Column({ type: 'varchar', length: 150 })
  slug: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column(() => Seo)
  seo: Seo;

  /**
   * `null` = draft; a future date = scheduled. Public reads only return
   * pages where this has passed (`isPublishedNow()`).
   */
  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  /** Deleted with the page (ON DELETE CASCADE on the section side). */
  @OneToMany(() => PageSection, (section) => section.page)
  sections: PageSection[];
}
