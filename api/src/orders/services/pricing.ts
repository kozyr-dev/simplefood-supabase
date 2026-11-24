import { ConflictException } from '@nestjs/common';
import type { Product } from '@/catalog/entities/product.entity';
import type { ValidationErrorDetail } from '@/common/validation/flatten-validation-errors';

export interface OrderLineInput {
  productId: string;
  quantity: number;
}

/** A line ready to save: the product's title and price copied now. */
export interface PricedLine {
  product: Product;
  productId: string;
  position: number;
  title: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface PricedOrder {
  items: PricedLine[];
  subtotal: number;
}

/**
 * Prices the cart from the database, never from the client: each line gets
 * the product's current title and price. An unknown or unavailable product
 * fails the whole order with 409 `PRODUCTS_UNAVAILABLE`, naming each bad
 * line in `details` (`items.2.productId`), so the client can point at it.
 * Nothing is dropped silently.
 *
 * `products`: the products found for the lines, by id.
 */
export function priceOrder(
  lines: readonly OrderLineInput[],
  products: ReadonlyMap<string, Product>,
): PricedOrder {
  const unavailable: ValidationErrorDetail[] = [];
  const items: PricedLine[] = [];

  lines.forEach(({ productId, quantity }, position) => {
    const product = products.get(productId);
    if (!product?.available) {
      unavailable.push({
        field: `items.${position}.productId`,
        messages: ['product is not available'],
      });
      return;
    }
    items.push({
      product,
      productId,
      position,
      title: product.title,
      unitPrice: product.price,
      quantity,
      lineTotal: product.price * quantity,
    });
  });

  if (unavailable.length) {
    throw new ConflictException({
      message: 'Some products are not available',
      code: 'PRODUCTS_UNAVAILABLE',
      details: unavailable,
    });
  }
  return {
    items,
    subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0),
  };
}
