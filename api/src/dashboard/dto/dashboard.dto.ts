import { OrderStatus } from '@/orders/entities/order.entity';

export class DashboardOrderDto {
  id: string;
  number: number;
  name: string;
  status: OrderStatus;
  /** Kopiykas. */
  subtotal: number;
  createdAt: Date;
}

export class DashboardDto {
  /** Every status, 0 included. */
  ordersByStatus: Record<OrderStatus, number>;
  /** Since midnight in Kyiv. */
  ordersToday: number;
  /** In the last 7 × 24 hours. */
  ordersLast7Days: number;
  unhandledMessages: number;
  /** The 5 newest. */
  latestOrders: DashboardOrderDto[];
}
