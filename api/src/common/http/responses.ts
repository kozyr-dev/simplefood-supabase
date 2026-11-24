import type { PaginationMetaDto } from './pagination-meta.dto';

/*
 * The API's response envelope: every endpoint returns `{ data }`, and lists
 * also return `{ meta }` with pagination. Controllers build it explicitly
 * (`return paginate(...)` / `return { data: item }`), so the shape is visible
 * where it's produced. Errors use a different shape (AllExceptionsFilter).
 */

/** A single resource or a non-paginated list: `{ data }`. */
export interface DataResponse<T> {
  data: T;
}

/** A page of a list: `{ data, meta }`. */
export interface Paginated<T> {
  data: T[];
  meta: PaginationMetaDto;
}

/** `page`/`pageSize` -> TypeORM's `skip`/`take`. */
export function toSkipTake({
  page,
  pageSize,
}: {
  page: number;
  pageSize: number;
}): {
  skip: number;
  take: number;
} {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/**
 * Builds a paginated response from one page of items and the total count,
 * e.g. from `repository.findAndCount({ ...toSkipTake(query) })`.
 */
export function paginate<T>(
  items: T[],
  total: number,
  { page, pageSize }: { page: number; pageSize: number },
): Paginated<T> {
  return {
    data: items,
    meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
  };
}
