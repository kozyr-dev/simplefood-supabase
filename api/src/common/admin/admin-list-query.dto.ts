import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  MAX_PAGE_SIZE,
  PaginationQueryDto,
} from '../http/pagination-query.dto';

export const SORT_ORDERS = ['ASC', 'DESC'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

/**
 * The query every admin list takes (the admin app's data provider sends
 * it): `page`, `pageSize`, `sort`, `order`, `q`, and `id` to fetch given
 * records. Each list extends it, with `sort` limited to its own columns
 * (`id` always among them: react-admin's pickers sort by it) and its own
 * filters.
 */
export abstract class AdminListQueryDto extends PaginationQueryDto {
  /** Overridden with `@IsIn([...])` by each list. */
  abstract sort: string;

  /** @example "ASC" */
  @IsOptional()
  @IsIn(SORT_ORDERS)
  order: SortOrder = 'ASC';

  /**
   * Free-text search; what it searches depends on the list.
   * @example "борщ"
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  /**
   * Only these records (`?id=a&id=b`), e.g. the ones a form shows.
   * @example ["01a1559c-a1ed-7641-ac0e-64612b99bb5a"]
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? value : [value],
  )
  @ArrayMaxSize(MAX_PAGE_SIZE)
  @IsUUID(undefined, { each: true })
  id?: string[];
}
