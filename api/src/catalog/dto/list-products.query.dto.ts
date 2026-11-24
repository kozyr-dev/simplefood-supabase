import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/http/pagination-query.dto';
import { ToBoolean } from '@/common/http/query-transforms';

/** `GET /api/products` filters, on top of `page`/`pageSize`. */
export class ListProductsQueryDto extends PaginationQueryDto {
  /**
   * Only products in this category (a category slug). An unknown slug
   * matches nothing: the result is an empty list, not a 404.
   * @example "pizza"
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  /** Only featured (`true`) or only non-featured (`false`) products. */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  featured?: boolean;

  /** Only favorite (`true`) or only non-favorite (`false`) products. */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  favorite?: boolean;
}
