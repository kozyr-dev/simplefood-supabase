import { OrderStatus } from './order.entity';

/**
 * The status changes the shop may make: `new → processing → completed`, and
 * `declined` from either of the first two. `declined` and `completed` are
 * final. The admin goes through canTransition(), so no screen can
 * skip a step or reopen a finished order.
 */
export const ORDER_TRANSITIONS: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  [OrderStatus.New]: [OrderStatus.Processing, OrderStatus.Declined],
  [OrderStatus.Processing]: [OrderStatus.Completed, OrderStatus.Declined],
  [OrderStatus.Declined]: [],
  [OrderStatus.Completed]: [],
};

/** Whether an order in status `from` may be moved to `to`. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}
