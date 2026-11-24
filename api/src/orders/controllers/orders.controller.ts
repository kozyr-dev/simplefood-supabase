import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiConflictResponse, ApiTags } from '@nestjs/swagger';
import { hours, Throttle } from '@nestjs/throttler';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { OptionalAuth } from '@/auth/decorators/optional-auth.decorator';
import { AuthThrottlerGuard } from '@/auth/guards/auth-throttler.guard';
import type { AuthUser } from '@/auth/types/auth.types';
import { ErrorResponseDto } from '@/common/filters/error-response.dto';
import {
  ApiAuth,
  ApiDataResponse,
  ApiOptionalAuth,
  ApiPaginatedResponse,
  ApiRateLimited,
} from '@/common/http/api-responses.decorator';
import { NoStore } from '@/common/http/no-store.decorator';
import { PaginationQueryDto } from '@/common/http/pagination-query.dto';
import type { DataResponse, Paginated } from '@/common/http/responses';
import { CreateOrderDto } from '../dto/create-order.dto';
import { OrderDto } from '../dto/order.dto';
import { OrdersService } from '../services/orders.service';

/** Personal data both ways: every response is @NoStore(). */
@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * Places an order, as a guest or logged in (then it's linked to the
   * account). Prices and totals come from the server. The shop and the
   * customer get an email.
   */
  @Post()
  @OptionalAuth()
  // Per account, or per IP for guests (their browser calls the API directly).
  @UseGuards(AuthThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: hours(1) } })
  @NoStore()
  @ApiOptionalAuth()
  @ApiDataResponse(OrderDto, { status: HttpStatus.CREATED })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      'A product is unknown or not available (`PRODUCTS_UNAVAILABLE`); ' +
      '`details` names each line, e.g. `items.2.productId`. Nothing was ordered.',
  })
  @ApiRateLimited()
  async create(
    @Body() dto: CreateOrderDto,
    @CurrentUser({ optional: true }) caller?: AuthUser,
  ): Promise<DataResponse<OrderDto>> {
    return { data: await this.orders.create(dto, caller) };
  }

  /** The logged-in customer's orders, newest first. */
  @Get('me')
  @ApiAuth()
  @NoStore()
  @ApiPaginatedResponse(OrderDto)
  findMine(
    @CurrentUser() caller: AuthUser,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<OrderDto>> {
    return this.orders.findMine(caller.id, query);
  }
}
