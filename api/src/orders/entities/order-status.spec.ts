import { canTransition, ORDER_TRANSITIONS } from './order-status';
import { OrderStatus } from './order.entity';

const { New, Processing, Declined, Completed } = OrderStatus;
const ALL = Object.values(OrderStatus);

/** Every allowed change, spelled out; any other pair must be refused. */
const ALLOWED = [
  [New, Processing],
  [New, Declined],
  [Processing, Completed],
  [Processing, Declined],
];

const isAllowed = (from: OrderStatus, to: OrderStatus) =>
  ALLOWED.some(([a, b]) => a === from && b === to);

describe('order status transitions', () => {
  it('has rules for every status', () => {
    expect(Object.keys(ORDER_TRANSITIONS).sort()).toEqual([...ALL].sort());
  });

  // All 16 pairs, so a rule added by mistake fails here too.
  it.each(ALL.flatMap((from) => ALL.map((to) => [from, to] as const)))(
    '%s → %s',
    (from, to) => {
      expect(canTransition(from, to)).toBe(isAllowed(from, to));
    },
  );

  it('never "changes" a status to itself', () => {
    for (const status of ALL) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it.each([Declined, Completed])('%s is final', (status) => {
    expect(ORDER_TRANSITIONS[status]).toEqual([]);
  });
});
