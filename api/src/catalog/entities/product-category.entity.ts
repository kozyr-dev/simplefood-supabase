import { Column, Entity, Unique } from 'typeorm';
import { AppBaseEntity } from '@/database/entities/base.entity';

// Named, so a duplicate slug reports `UQ_product_category_slug`.
@Entity()
@Unique('UQ_product_category_slug', ['slug'])
export class ProductCategory extends AppBaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** Used in URLs and the products filter (`?category=pizza`). */
  @Column({ type: 'varchar', length: 100 })
  slug: string;

  /** Display order: lower first. */
  @Column({ type: 'integer', default: 0 })
  position: number;
}
