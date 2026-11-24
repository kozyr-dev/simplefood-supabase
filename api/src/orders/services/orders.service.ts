import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';
import type { AuthUser } from '@/auth/types/auth.types';
import { Product } from '@/catalog/entities/product.entity';
import type { PaginationQueryDto } from '@/common/http/pagination-query.dto';
import { paginate, toSkipTake, type Paginated } from '@/common/http/responses';
import mailConfig, { type MailConfig } from '@/config/mail.config';
import { MailService } from '@/mail/services/mail.service';
import { UsersService } from '@/users/services/users.service';
import type { CreateOrderDto } from '../dto/create-order.dto';
import type { OrderDto } from '../dto/order.dto';
import { OrderItem } from '../entities/order-item.entity';
import { Order, OrderStatus, ShippingMethod } from '../entities/order.entity';
import { toOrderDto } from '../mappers/order.mapper';
import {
  orderConfirmation,
  orderShopNotification,
} from '../templates/order-emails';
import { priceOrder } from './pricing';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItems: Repository<OrderItem>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly users: UsersService,
    private readonly mail: MailService,
    @Inject(mailConfig.KEY) private readonly mailSettings: MailConfig,
  ) {}

  /**
   * Places an order, priced from the database (pricing.ts). The order and
   * its items are saved together; then the shop and the customer are
   * emailed in the background. `caller`: the logged-in customer, if any.
   */
  async create(dto: CreateOrderDto, caller?: AuthUser): Promise<OrderDto> {
    // A token whose account was deleted or blocked since: 401, never a
    // silent guest order.
    const user = caller ? await this.users.findActive(caller.id) : null;

    const products = await this.products.findBy({
      id: In(dto.items.map((line) => line.productId)),
    });
    const { items, subtotal } = priceOrder(
      dto.items,
      new Map(products.map((product) => [product.id, product])),
    );

    // save() runs in a transaction: the order and its items (cascade insert)
    // are stored together or not at all.
    const order = await this.orders.save(
      this.orders.create({
        user,
        userId: user?.id ?? null,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        shippingMethod: dto.shippingMethod,
        address:
          dto.shippingMethod === ShippingMethod.Delivery
            ? (dto.address ?? null)
            : null,
        // Trimmed by TrimPipe: an empty comment is no comment.
        comments: dto.comments || null,
        status: OrderStatus.New,
        subtotal,
        legacyDishesText: null,
        items: items.map((item) => this.orderItems.create(item)),
      }),
    );

    const result = toOrderDto(order, order.items);
    this.notify(result, { registered: user !== null });
    return result;
  }

  /**
   * The caller's orders, newest first. 401 if the account was deleted or
   * blocked since the token was issued, as for GET /users/me.
   */
  async findMine(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<Paginated<OrderDto>> {
    await this.users.findActive(userId);

    const [orders, total] = await this.orders.findAndCount({
      where: { userId },
      // id breaks ties, so pages never overlap or skip an order.
      order: { createdAt: 'DESC', id: 'DESC' },
      ...toSkipTake(query),
    });

    // One query for the items of the whole page, not one per order.
    const items = orders.length
      ? await this.orderItems.findBy({
          orderId: In(orders.map((order) => order.id)),
        })
      : [];
    const itemsByOrder = new Map<string, OrderItem[]>();
    for (const item of items) {
      itemsByOrder.set(item.orderId, [
        ...(itemsByOrder.get(item.orderId) ?? []),
        item,
      ]);
    }

    return paginate(
      orders.map((order) =>
        toOrderDto(order, itemsByOrder.get(order.id) ?? []),
      ),
      total,
      query,
    );
  }

  /** After the commit; sending never delays or fails the order. */
  private notify(order: OrderDto, { registered }: { registered: boolean }) {
    this.mail.send('order-shop', {
      to: this.mailSettings.notifyTo,
      replyTo: order.email,
      ...orderShopNotification(order, { registered }),
    });
    this.mail.send('order-customer', {
      to: order.email,
      ...orderConfirmation(order),
    });
  }
}
