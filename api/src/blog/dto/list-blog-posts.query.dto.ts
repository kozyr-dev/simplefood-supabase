import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/http/pagination-query.dto';

/** `GET /api/blog-posts` filters, on top of `page`/`pageSize`. */
export class ListBlogPostsQueryDto extends PaginationQueryDto {
  /**
   * Only posts in this category (a category slug). An unknown slug matches
   * nothing: the result is an empty list, not a 404.
   * @example "news"
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;
}
