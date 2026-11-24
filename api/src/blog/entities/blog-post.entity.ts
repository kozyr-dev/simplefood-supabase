import {
  Column,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  ManyToOne,
  Unique,
} from 'typeorm';
import { AppBaseEntity } from '@/database/entities/base.entity';
import { Media } from '@/media/entities/media.entity';
import { BlogCategory } from './blog-category.entity';
import { Seo } from '@/database/entities/seo.embedded';

// Named constraints: a violation reads e.g. `violates unique constraint
// "UQ_blog_post_slug"`, not a generated hash.
@Entity()
@Unique('UQ_blog_post_slug', ['slug'])
@Index('IDX_blog_post_published_at', ['publishedAt'])
export class BlogPost extends AppBaseEntity {
  @Column({ type: 'varchar', length: 150 })
  slug: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  /** Markdown. */
  @Column({ type: 'text' })
  text: string;

  /** Deleting the file must never delete the blog post. */
  @ManyToOne(() => Media, { nullable: true, onDelete: 'SET NULL' })
  image: Media | null;

  @Column(() => Seo)
  seo: Seo;

  /**
   * `null` = draft; a future date = scheduled. Public reads only return
   * posts where this has passed (`isPublishedNow()`).
   */
  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  // Explicit names: TypeORM's default would be
  // `blog_post_categories_blog_category`.
  @ManyToMany(() => BlogCategory)
  @JoinTable({
    name: 'blog_post_to_category',
    joinColumn: { name: 'blog_post_id' },
    inverseJoinColumn: { name: 'category_id' },
  })
  categories: BlogCategory[];
}
