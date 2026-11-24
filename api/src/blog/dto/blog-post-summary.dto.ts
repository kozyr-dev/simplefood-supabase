import { ApiProperty } from '@nestjs/swagger';
import { MediaDto } from '@/media/dto/media.dto';
import { BlogCategoryDto } from './blog-category.dto';

/** A blog post in a list: a plain-text excerpt instead of the full text. */
export class BlogPostSummaryDto {
  /** @example "01a1559c-a1ed-7641-ac0e-64612b99bb5a" */
  id: string;

  /** @example "autumn-menu" */
  slug: string;

  /** @example "Our autumn menu" */
  title: string;

  /**
   * Up to 160 characters of the text, markdown stripped, cut at a word.
   * @example "New dishes Try our borscht and…"
   */
  excerpt: string;

  // Explicit: from `MediaDto | null` the plugin only infers `object`.
  @ApiProperty({
    type: MediaDto,
    nullable: true,
    description: 'Cover photo; null when there is none.',
  })
  image: MediaDto | null;

  /** @example "2024-06-05T12:34:56.789Z" */
  publishedAt: Date;

  categories: BlogCategoryDto[];
}
