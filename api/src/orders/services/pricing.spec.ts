import { ConflictException } from '@nestjs/common';
import type { Product } from '@/catalog/entities/product.entity';
import { priceOrder } from './pricing';

const product = (id: string, overrides: Partial<Product> = {}): Product =>
  ({
    id,
    title: `Dish ${id}`,
    price: 10000,
    available: true,
    ...overrides,
  }) as Product;

const byId = (...products: Product[]) =>
  new Map(products.map((item) => [item.id, item]));

/** The 409 priceOrder throws; fails the test if it doesn't. */
function conflictOf(run: () => unknown): Record<string, unknown> {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ConflictException);
    return (error as ConflictException).getResponse() as Record<
      string,
      unknown
    >;
  }
  throw new Error('expected a ConflictException');
}

describe('priceOrder', () => {
  const borscht = product('a', { title: 'Борщ', price: 18900 });
  const compote = product('b', { title: 'Компот', price: 4500 });

  it("copies each product's current title and price; totals in kopiykas", () => {
    const { items, subtotal } = priceOrder(
      [
        { productId: 'a', quantity: 2 },
        { productId: 'b', quantity: 1 },
      ],
      byId(borscht, compote),
    );

    expect(items).toEqual([
      {
        product: borscht,
        productId: 'a',
        position: 0,
        title: 'Борщ',
        unitPrice: 18900,
        quantity: 2,
        lineTotal: 37800,
      },
      {
        product: compote,
        productId: 'b',
        position: 1,
        title: 'Компот',
        unitPrice: 4500,
        quantity: 1,
        lineTotal: 4500,
      },
    ]);
    expect(subtotal).toBe(42300);
  });

  it('keeps the order of the lines as sent', () => {
    const { items } = priceOrder(
      [
        { productId: 'b', quantity: 1 },
        { productId: 'a', quantity: 1 },
      ],
      byId(borscht, compote),
    );

    expect(items.map((item) => [item.position, item.title])).toEqual([
      [0, 'Компот'],
      [1, 'Борщ'],
    ]);
  });

  it('prices a free item at 0', () => {
    const { items, subtotal } = priceOrder(
      [{ productId: 'gift', quantity: 3 }],
      byId(product('gift', { price: 0 })),
    );

    expect(items[0].lineTotal).toBe(0);
    expect(subtotal).toBe(0);
  });

  it('refuses the whole order, naming every unknown or unavailable line', () => {
    const response = conflictOf(() =>
      priceOrder(
        [
          { productId: 'a', quantity: 1 },
          { productId: 'gone', quantity: 1 },
          { productId: 'b', quantity: 1 },
          { productId: 'sold-out', quantity: 2 },
        ],
        byId(borscht, compote, product('sold-out', { available: false })),
      ),
    );

    expect(response).toEqual({
      message: 'Some products are not available',
      code: 'PRODUCTS_UNAVAILABLE',
      details: [
        { field: 'items.1.productId', messages: ['product is not available'] },
        { field: 'items.3.productId', messages: ['product is not available'] },
      ],
    });
  });
});
