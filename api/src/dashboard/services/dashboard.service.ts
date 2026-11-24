import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, type Repository } from 'typeorm';
import { ContactSubmission } from '@/contact/entities/contact-submission.entity';
import { Order, OrderStatus } from '@/orders/entities/order.entity';
import type { DashboardDto } from '../dto/dashboard.dto';

/** The shop's day is Kyiv's, wherever the server runs. */
export const SHOP_TIME_ZONE = 'Europe/Kyiv';

/** What needs attention: four queries, whatever the data. */
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(ContactSubmission)
    private readonly messages: Repository<ContactSubmission>,
  ) {}

  async get(): Promise<DashboardDto> {
    const [byStatus, recent, unhandledMessages, latest] = await Promise.all([
      this.orders
        .createQueryBuilder('o')
        .select('o.status', 'status')
        .addSelect('count(*)::int', 'count')
        .groupBy('o.status')
        .getRawMany<{ status: OrderStatus; count: number }>(),
      this.orders
        .createQueryBuilder('o')
        .select(
          `count(*) FILTER (WHERE o.created_at >= date_trunc('day', now() AT TIME ZONE :zone) AT TIME ZONE :zone)::int`,
          'today',
        )
        .addSelect(
          `count(*) FILTER (WHERE o.created_at >= now() - interval '7 days')::int`,
          'week',
        )
        .setParameter('zone', SHOP_TIME_ZONE)
        .getRawOne<{ today: number; week: number }>(),
      this.messages.countBy({ handledAt: IsNull() }),
      this.orders.find({ order: { createdAt: 'DESC', id: 'DESC' }, take: 5 }),
    ]);

    const ordersByStatus = Object.fromEntries(
      Object.values(OrderStatus).map((status) => [
        status,
        byStatus.find((row) => row.status === status)?.count ?? 0,
      ]),
    ) as Record<OrderStatus, number>;

    return {
      ordersByStatus,
      ordersToday: recent?.today ?? 0,
      ordersLast7Days: recent?.week ?? 0,
      unhandledMessages,
      latestOrders: latest.map((order) => ({
        id: order.id,
        number: order.number,
        name: order.name,
        status: order.status,
        subtotal: order.subtotal,
        createdAt: order.createdAt,
      })),
    };
  }
}
