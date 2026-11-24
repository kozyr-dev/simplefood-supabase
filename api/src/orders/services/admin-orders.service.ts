import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  And,
  In,
  LessThan,
  MoreThanOrEqual,
  type FindOperator,
  type FindOptionsWhere,
  type Repository,
} from 'typeorm';
import { adminOrder, contains } from '@/common/admin/admin-list';
import { paginate, toSkipTake, type Paginated } from '@/common/http/responses';
import type {
  AdminOrderDto,
  AdminOrdersQueryDto,
  ChangeOrderStatusDto,
} from '../dto/admin-order.dto';
import { OrderItem } from '../entities/order-item.entity';
import { canTransition } from '../entities/order-status';
import { Order } from '../entities/order.entity';
import { toAdminOrderDto } from '../mappers/order.mapper';

/**
 * Orders for the shop's staff: read, and moved through their statuses,
 * nothing else. An order is a record of what the customer agreed to.
 */
@Injectable()
export class AdminOrdersService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly items: Repository<OrderItem>,
  ) {}

  async findAll(query: AdminOrdersQueryDto): Promise<Paginated<AdminOrderDto>> {
    const base: FindOptionsWhere<Order> = {};
    if (query.id) base.id = In(query.id);
    if (query.status) base.status = query.status;
    if (query.userId) base.userId = query.userId;
    const createdAt = dateRange(query.from, query.to);
    if (createdAt) base.createdAt = createdAt;

    // `q`: an order number, or part of the name, phone or email.
    const where: FindOptionsWhere<Order>[] = query.q
      ? /^\d{1,9}$/.test(query.q.trim())
        ? [{ ...base, number: Number(query.q.trim()) }]
        : (['name', 'phone', 'email'] as const).map((field) => ({
            ...base,
            [field]: contains(query.q as string),
          }))
      : [base];

    const [rows, total] = await this.orders.findAndCount({
      where,
      order: adminOrder(query.sort, query.order),
      ...toSkipTake(query),
    });
    const counts = await this.itemCounts(rows.map((order) => order.id));
    return paginate(
      rows.map((order) =>
        toAdminOrderDto(order, [], counts.get(order.id) ?? 0),
      ),
      total,
      query,
    );
  }

  /** With its items. */
  async findOne(id: string): Promise<AdminOrderDto> {
    const order = await this.orders.findOneBy({ id });
    if (!order) throw notFound();
    const items = await this.items.find({
      where: { orderId: id },
      order: { position: 'ASC' },
    });
    return toAdminOrderDto(order, items);
  }

  /**
   * Moves the order to `status` if canTransition() allows it from the
   * status it has (400 `INVALID_TRANSITION` otherwise). The update is
   * conditional on that status: if someone else changed it meanwhile,
   * nothing happens and the answer is 409 `ORDER_STATUS_CHANGED`.
   */
  async changeStatus(
    id: string,
    { status }: ChangeOrderStatusDto,
  ): Promise<AdminOrderDto> {
    const order = await this.orders.findOneBy({ id });
    if (!order) throw notFound();
    if (!canTransition(order.status, status)) {
      throw new BadRequestException({
        message: `An order can't go from "${order.status}" to "${status}"`,
        code: 'INVALID_TRANSITION',
      });
    }
    const { affected } = await this.orders.update(
      { id, status: order.status },
      { status },
    );
    if (!affected) {
      throw new ConflictException({
        message: 'Someone else changed this order; reload it',
        code: 'ORDER_STATUS_CHANGED',
      });
    }
    return this.findOne(id);
  }

  private async itemCounts(orderIds: string[]): Promise<Map<string, number>> {
    if (!orderIds.length) return new Map();
    const rows = await this.items
      .createQueryBuilder('item')
      .select('item.order_id', 'orderId')
      .addSelect('count(*)::int', 'count')
      .where('item.order_id IN (:...orderIds)', { orderIds })
      .groupBy('item.order_id')
      .getRawMany<{ orderId: string; count: number }>();
    return new Map(rows.map((row) => [row.orderId, row.count]));
  }
}

function dateRange(
  from: string | undefined,
  to: string | undefined,
): FindOperator<Date> | undefined {
  if (from && to) {
    return And(MoreThanOrEqual(new Date(from)), LessThan(new Date(to)));
  }
  if (from) return MoreThanOrEqual(new Date(from));
  if (to) return LessThan(new Date(to));
  return undefined;
}

function notFound(): NotFoundException {
  return new NotFoundException('Order not found');
}
