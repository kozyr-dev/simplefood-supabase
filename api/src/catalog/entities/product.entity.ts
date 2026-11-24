import {
  Check,
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  Unique,
} from 'typeorm';
import { AppBaseEntity } from '@/database/entities/base.entity';
import { Media } from '@/media/entities/media.entity';
import { ProductCategory } from './product-category.entity';

// Named constraints: a violation reads e.g. `violates unique constraint
// "UQ_product_slug"`, not a generated hash.
@Entity()
@Unique('UQ_product_slug', ['slug'])
@Check('CHK_product_price_non_negative', '"price" >= 0')
@Check('CHK_product_weight_positive', '"weight" IS NULL OR "weight" > 0')
@Check(
  'CHK_product_calories_non_negative',
  '"calories" IS NULL OR "calories" >= 0',
)
export class Product extends AppBaseEntity {
  @Column({ type: 'varchar', length: 150 })
  slug: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  /** HTML, shown as-is by the site; sanitized on write (sanitizeRichHtml). */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /**
   * In kopiykas (1/100 UAH): `18900` = 189.00 UAH. Integers keep totals exact;
   * `numeric` would come back from `pg` as a string, and JS floats round.
   */
  @Column({ type: 'integer' })
  price: number;

  /** Grams. */
  @Column({ type: 'integer', nullable: true })
  weight: number | null;

  /** Kilocalories per portion. */
  @Column({ type: 'integer', nullable: true })
  calories: number | null;

  @Column({ type: 'boolean', default: true })
  available: boolean;

  @Column({ type: 'boolean', default: false })
  featured: boolean;

  @Column({ type: 'boolean', default: false })
  favorite: boolean;

  /** Deleting the file must never delete the product. */
  @ManyToOne(() => Media, { nullable: true, onDelete: 'SET NULL' })
  image: Media | null;

  // Explicit names: TypeORM's default would be
  // `product_categories_product_category`.
  @ManyToMany(() => ProductCategory)
  @JoinTable({
    name: 'product_to_category',
    joinColumn: { name: 'product_id' },
    inverseJoinColumn: { name: 'category_id' },
  })
  categories: ProductCategory[];
}
