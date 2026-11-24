import { ApiProperty } from '@nestjs/swagger';
import { MediaDto } from '@/media/dto/media.dto';
import { ProductCategoryDto } from './product-category.dto';

export class ProductDto {
  /** @example "01a1559c-a1ed-7641-ac0e-64612b99bb5a" */
  id: string;

  /** @example "borscht" */
  slug: string;

  /** @example "Borscht" */
  title: string;

  /** HTML; null when the product has no description. */
  description: string | null;

  /**
   * Price in kopiykas (1/100 UAH): `18900` = 189.00 UAH. Divide by 100 to display.
   * @example 18900
   */
  price: number;

  /**
   * Weight in grams; null when unknown.
   * @example 350
   */
  weight: number | null;

  /**
   * Kilocalories per portion; null when unknown.
   * @example 420
   */
  calories: number | null;

  /** False when the product can't be ordered right now. */
  available: boolean;

  /** Shown in "featured" sections. */
  featured: boolean;

  /** Shown in "favorites" sections. */
  favorite: boolean;

  // Explicit: from `MediaDto | null` the plugin only infers `object`.
  @ApiProperty({
    type: MediaDto,
    nullable: true,
    description: 'Product photo; null when there is none.',
  })
  image: MediaDto | null;

  /** Ordered by the categories' position, then name. */
  categories: ProductCategoryDto[];
}
