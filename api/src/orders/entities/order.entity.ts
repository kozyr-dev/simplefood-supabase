import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';
import { AppBaseEntity } from '@/database/entities/base.entity';
import { User } from '@/users/entities/user.entity';
import { OrderItem } from './order-item.entity';

/** Where an order is in the shop's work. Allowed changes: order-status.ts. */
export enum OrderStatus {
  New = 'new',
  Processing = 'processing',
  Declined = 'declined',
  Completed = 'completed',
}

/** The frontend's `flat_rate` (courier) and `local_pickup`. */
export enum ShippingMethod {
  Delivery = 'delivery',
  Pickup = 'pickup',
}

/**
 * Not `order`: ORDER is a reserved SQL word, so every hand-written query (the
 * Strapi data migration, psql) would have to quote it.
 *
 * Prices are copied into the items when the order is placed, so an order
 * never changes when a product's price or title does. The checks repeat the
 * DTO rules for writers that skip the DTOs (the data migration).
 */
@Entity('customer_order')
@Unique('UQ_customer_order_number', ['number'])
// "My orders", newest first (ORDER BY created_at DESC, id DESC); also serves
// the foreign key when a user is deleted.
@Index('IDX_customer_order_user_created', ['user', 'createdAt', 'id'])
@Check('CHK_customer_order_subtotal_non_negative', '"subtotal" >= 0')
@Check('CHK_customer_order_email', `position('@' in "email") > 1`)
@Check(
  'CHK_customer_order_delivery_address',
  `"shipping_method" <> 'delivery' OR "address" IS NOT NULL`,
)
export class Order extends AppBaseEntity {
  /**
   * For people: "order 42" on the phone and in email subjects; the uuid stays
   * the key. Assigned by Postgres and never writable (GENERATED ALWAYS), so
   * the admin can't renumber an order. No route takes a number, so guessing
   * one gains nothing.
   *
   * `migration:generate` doesn't see a change between ALWAYS and BY DEFAULT
   * (the migrations e2e test does): changing it needs a hand-written migration.
   */
  @Column({
    type: 'integer',
    generated: 'identity',
    generatedIdentity: 'ALWAYS',
  })
  number: number;

  /**
   * The logged-in customer who placed it; `null` for a guest. Taken from the
   * access token, never matched by email. Deleting the account keeps the
   * order for the shop's records.
   */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  /** The `user_id` column itself: filter by it without a join. */
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  /** Contact details for this order, as entered at checkout. */
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ type: 'varchar', length: 30 })
  phone: string;

  /** Required for delivery; `null` for pickup. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  address: string | null;

  @Column({
    type: 'enum',
    enum: ShippingMethod,
    enumName: 'shipping_method',
  })
  shippingMethod: ShippingMethod;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  comments: string | null;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status',
    default: OrderStatus.New,
  })
  status: OrderStatus;

  /** Sum of the items' line totals, in kopiykas. No delivery fee exists yet. */
  @Column({ type: 'integer' })
  subtotal: number;

  /**
   * Migrated Strapi orders only: their free-text dish list ("Борщ - 2 шт.").
   * They have no items.
   */
  @Column({ type: 'text', nullable: true })
  legacyDishesText: string | null;

  /** Saved with the order (cascade insert); never changed afterwards. */
  @OneToMany(() => OrderItem, (item) => item.order, { cascade: ['insert'] })
  items: OrderItem[];
}
