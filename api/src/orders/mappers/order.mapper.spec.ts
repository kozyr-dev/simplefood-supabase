import type { OrderItem } from '../entities/order-item.entity';
import {
  OrderStatus,
  ShippingMethod,
  type Order,
} from '../entities/order.entity';
import { toOrderDto } from './order.mapper';

const createdAt = new Date('2026-11-06T10:00:00Z');

const order = {
  id: 'order-1',
  number: 42,
  status: OrderStatus.New,
  shippingMethod: ShippingMethod.Delivery,
  name: 'Іван',
  email: 'ivan@example.com',
  phone: '+380 67 123 45 67',
  address: 'Kyiv',
  comments: null,
  subtotal: 42300,
  legacyDishesText: null,
  user: null,
  userId: 'user-1',
  createdAt,
  updatedAt: createdAt,
  items: [],
} satisfies Order;

const item = (position: number, title: string): OrderItem =>
  ({
    id: `item-${position}`,
    orderId: 'order-1',
    productId: `product-${position}`,
    position,
    title,
    unitPrice: 100,
    quantity: 1,
    lineTotal: 100,
  }) as OrderItem;

describe('toOrderDto', () => {
  it('copies the public fields only: no owner, no internal ids', () => {
    expect(toOrderDto(order, [item(0, 'Борщ')])).toEqual({
      id: 'order-1',
      number: 42,
      status: 'new',
      shippingMethod: 'delivery',
      name: 'Іван',
      email: 'ivan@example.com',
      phone: '+380 67 123 45 67',
      address: 'Kyiv',
      comments: null,
      subtotal: 42300,
      items: [
        {
          productId: 'product-0',
          title: 'Борщ',
          unitPrice: 100,
          quantity: 1,
          lineTotal: 100,
        },
      ],
      legacyItemsText: null,
      createdAt,
    });
  });

  it('puts the items in position order, without reordering the input', () => {
    const items = [item(2, 'C'), item(0, 'A'), item(1, 'B')];

    const dto = toOrderDto(order, items);

    expect(dto.items.map((line) => line.title)).toEqual(['A', 'B', 'C']);
    expect(items.map((line) => line.title)).toEqual(['C', 'A', 'B']);
  });

  it('shows an old-site order by its dish text', () => {
    const legacy = { ...order, legacyDishesText: 'Борщ - 2 шт.' } as Order;

    expect(toOrderDto(legacy, [])).toMatchObject({
      items: [],
      legacyItemsText: 'Борщ - 2 шт.',
    });
  });
});
