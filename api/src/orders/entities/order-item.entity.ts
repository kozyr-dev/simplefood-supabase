import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Unique,
} from 'typeorm';
import { Product } from '@/catalog/entities/product.entity';
import { AppBaseEntity } from '@/database/entities/base.entity';
import { Order } from './order.entity';

/**
 * One line of an order. Title and price are copies taken when the order was
 * placed: what the customer agreed to, whatever happens to the product since.
 * All money in kopiykas.
 */
@Entity()
// The lines in the order they were sent. Also the index for "items of these
// orders" (order_id comes first) and for the cascade delete.
@Unique('UQ_order_item_position', ['order', 'position'])
@Check('CHK_order_item_quantity_positive', '"quantity" > 0')
@Check('CHK_order_item_unit_price_non_negative', '"unit_price" >= 0')
@Check('CHK_order_item_line_total', '"line_total" = "unit_price" * "quantity"')
export class OrderItem extends AppBaseEntity {
  /** Items always belong to an order and are deleted with it. */
  @ManyToOne(() => Order, (order) => order.items, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  /** The `order_id` column itself: load the items of many orders at once. */
  @Column({ type: 'uuid' })
  orderId: string;

  /** 0-based, in the order the items were sent. */
  @Column({ type: 'smallint' })
  position: number;

  /**
   * The product as it is now; `null` once it's deleted (the copies below
   * keep the order readable). Indexed for that `SET NULL` on delete.
   */
  @Index('IDX_order_item_product')
  @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'product_id' })
  product: Product | null;

  /** The `product_id` column itself: readable without loading the product. */
  @Column({ type: 'uuid', nullable: true })
  productId: string | null;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'integer' })
  unitPrice: number;

  @Column({ type: 'integer' })
  quantity: number;

  /** unitPrice × quantity; the database checks it. */
  @Column({ type: 'integer' })
  lineTotal: number;
}
