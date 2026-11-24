export class BlogCategoryDto {
  /** @example "01a1559c-a1ed-7641-ac0e-64612b99bb5a" */
  id: string;

  /** @example "News" */
  name: string;

  /**
   * Use it to filter posts: `GET /api/blog-posts?category=news`.
   * @example "news"
   */
  slug: string;
}
