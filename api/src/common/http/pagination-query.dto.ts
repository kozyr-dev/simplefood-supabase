import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * `?page=&pageSize=` for list endpoints. Extend it with filters, e.g.
 * `class ListProductsQuery extends PaginationQueryDto { category?: string }`.
 *
 * Query values arrive as strings and implicit conversion is off (see
 * app.setup.ts), so each number is converted explicitly with @Type().
 */
export class PaginationQueryDto {
  /**
   * Page number, starting at 1.
   * @example 1
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  /**
   * Items per page.
   * @example 20
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;
}
