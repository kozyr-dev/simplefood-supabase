import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PHONE_MESSAGE, PHONE_PATTERN } from '@/users/dto/user-fields.dto';
import { ShippingMethod } from '../entities/order.entity';

export const MAX_ORDER_LINES = 50;
export const MAX_QUANTITY = 99;

/** One line of the cart. No price: the server takes it from the product. */
export class OrderLineDto {
  /**
   * The product's id. Postgres compares uuids in any letter case; the
   * lookups here are exact, so it's lowercased first.
   * @example "019a1b2c-3d4e-7f50-8a6b-7c8d9e0f1a2b"
   */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID()
  productId: string;

  /** @example 2 */
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY)
  quantity: number;
}

/**
 * POST /orders. Prices, totals and the status are the server's: a body that
 * sends `price`, `amount`, `subtotal` or `status` is refused with 400
 * (`forbidNonWhitelisted`), never silently trusted.
 */
export class CreateOrderDto {
  /** Each product once; the order of the lines is kept. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ORDER_LINES)
  @ArrayUnique((line: OrderLineDto) => line.productId, {
    message: 'items must not list a product twice',
  })
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items: OrderLineDto[];

  /** @example "Ivan Petrenko" */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  /**
   * Required for guests and logged-in customers alike: the confirmation goes
   * here. Never used to link the order to an account.
   * @example "ivan@example.com"
   */
  @IsEmail()
  @MaxLength(254)
  email: string;

  /** @example "+380 67 123 45 67" */
  @IsString()
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone: string;

  /** @example "delivery" */
  @IsEnum(ShippingMethod)
  shippingMethod: ShippingMethod;

  /**
   * Required for delivery. Ignored for pickup (stored as `null`).
   * @example "Kyiv, Khreshchatyk St, 1, apt. 5"
   */
  @ValidateIf(
    (dto: CreateOrderDto) => dto.shippingMethod === ShippingMethod.Delivery,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address?: string;

  /** @example "Ring twice, please" */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comments?: string;
}
