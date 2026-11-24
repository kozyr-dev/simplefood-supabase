import { Column, Entity, Unique } from 'typeorm';
import { AppBaseEntity } from '@/database/entities/base.entity';

// Named, so a duplicate slug reports `UQ_blog_category_slug` instead of a generated hash.
@Entity()
@Unique('UQ_blog_category_slug', ['slug'])
export class BlogCategory extends AppBaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** Used in URLs and the blog filter (`?category=pizza`). */
  @Column({ type: 'varchar', length: 100 })
  slug: string;
}
