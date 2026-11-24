/** `meta` of every paginated response. */
export class PaginationMetaDto {
  /**
   * The requested page, starting at 1.
   * @example 2
   */
  page: number;

  /**
   * Items per page.
   * @example 20
   */
  pageSize: number;

  /**
   * Items across all pages.
   * @example 41
   */
  total: number;

  /**
   * Number of pages; 0 when there are no items.
   * @example 3
   */
  pageCount: number;
}
