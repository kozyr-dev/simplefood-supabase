import { OrderStatus, ShippingMethod } from '../entities/order.entity';

/** One line, as priced when the order was placed. Money in kopiykas. */
export class OrderItemDto {
  /**
   * The product, for linking to it; `null` once it has been deleted.
   * @example "019a1b2c-3d4e-7f50-8a6b-7c8d9e0f1a2b"
   */
  productId: string | null;

  /** @example "Борщ" */
  title: string;

  /** @example 18900 */
  unitPrice: number;

  /** @example 2 */
  quantity: number;

  /** @example 37800 */
  lineTotal: number;
}

/** An order as its customer sees it. Money in kopiykas. */
export class OrderDto {
  /** @example "019a1b2c-3d4e-7f50-8a6b-7c8d9e0f1a2b" */
  id: string;

  /**
   * For people: quote it on the phone ("order 42").
   * @example 42
   */
  number: number;

  /** @example "new" */
  status: OrderStatus;

  /** @example "delivery" */
  shippingMethod: ShippingMethod;

  /** @example "Ivan Petrenko" */
  name: string;

  /** @example "ivan@example.com" */
  email: string;

  /** @example "+380 67 123 45 67" */
  phone: string;

  /**
   * `null` for pickup.
   * @example "Kyiv, Khreshchatyk St, 1, apt. 5"
   */
  address: string | null;

  /** @example "Ring twice, please" */
  comments: string | null;

  /**
   * Sum of the line totals.
   * @example 37800
   */
  subtotal: number;

  /** In the order they were sent. Empty for orders from the old site. */
  items: OrderItemDto[];

  /**
   * Orders from the old site only: their dish list as free text, since they
   * have no items. `null` for every new order.
   * @example null
   */
  legacyItemsText: string | null;

  createdAt: Date;
}
