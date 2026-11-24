import type { AdminOrderDto } from '../dto/admin-order.dto';
import type { OrderDto, OrderItemDto } from '../dto/order.dto';
import type { OrderItem } from '../entities/order-item.entity';
import { ORDER_TRANSITIONS } from '../entities/order-status';
import type { Order } from '../entities/order.entity';

/** Field by field, so a new column never reaches a response by accident. */
export function toOrderItemDto(item: OrderItem): OrderItemDto {
  return {
    productId: item.productId,
    title: item.title,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    lineTotal: item.lineTotal,
  };
}

/**
 * `items` come out in position order, whatever order they're passed in.
 * Never the owner (`user`): the caller is the owner, or a guest who just
 * placed it.
 */
export function toOrderDto(order: Order, items: OrderItem[]): OrderDto {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    shippingMethod: order.shippingMethod,
    name: order.name,
    email: order.email,
    phone: order.phone,
    address: order.address,
    comments: order.comments,
    subtotal: order.subtotal,
    items: [...items]
      .sort((a, b) => a.position - b.position)
      .map(toOrderItemDto),
    legacyItemsText: order.legacyDishesText,
    createdAt: order.createdAt,
  };
}

/** For the shop's staff: the order plus its account link and next statuses. */
export function toAdminOrderDto(
  order: Order,
  items: OrderItem[],
  itemCount = items.length,
): AdminOrderDto {
  return Object.assign(toOrderDto(order, items), {
    userId: order.userId,
    itemCount,
    nextStatuses: [...ORDER_TRANSITIONS[order.status]],
    updatedAt: order.updatedAt,
  });
}
