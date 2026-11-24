import { IsEnum, IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { AdminListQueryDto } from '@/common/admin/admin-list-query.dto';
import { OrderStatus } from '../entities/order.entity';
import { OrderDto } from './order.dto';

/** An order as the shop's staff see it. */
export class AdminOrderDto extends OrderDto {
  /** The customer's account; null for a guest (or a deleted account). */
  userId: string | null;
  itemCount: number;
  /** The statuses it may move to now (`canTransition()`). */
  nextStatuses: OrderStatus[];
  updatedAt: Date;
}

export const ORDER_SORTS = [
  'id',
  'number',
  'createdAt',
  'subtotal',
  'status',
] as const;

export class AdminOrdersQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsIn(ORDER_SORTS)
  sort: string = 'createdAt';

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsUUID()
  userId?: string;

  /** Placed at or after this time (ISO 8601). */
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  /** Placed before this time (ISO 8601). */
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class ChangeOrderStatusDto {
  /** Only a status `nextStatuses` lists. */
  @IsEnum(OrderStatus)
  status: OrderStatus;
}
