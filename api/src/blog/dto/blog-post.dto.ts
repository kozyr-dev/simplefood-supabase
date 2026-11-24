import { SeoDto } from '@/common/seo/seo.dto';
import { BlogPostSummaryDto } from './blog-post-summary.dto';

/** One blog post: the list fields plus the full text, SEO and `updatedAt`. */
export class BlogPostDto extends BlogPostSummaryDto {
  /** The full post, in markdown. */
  text: string;

  seo: SeoDto;

  /** @example "2024-06-06T08:00:00.000Z" */
  updatedAt: Date;
}
