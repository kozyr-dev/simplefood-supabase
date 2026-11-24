export class ProductCategoryDto {
  /** @example "01a1559c-a1ed-7641-ac0e-64612b99bb5a" */
  id: string;

  /** @example "Pizza" */
  name: string;

  /**
   * Use it to filter products: `GET /api/products?category=pizza`.
   * @example "pizza"
   */
  slug: string;
}
