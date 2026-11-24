import { Body, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse } from '@nestjs/swagger';
import { AdminController } from '@/auth/decorators/admin-controller.decorator';
import { ApiAdminNotFound } from '@/common/admin/admin-docs';
import { ErrorResponseDto } from '@/common/filters/error-response.dto';
import {
  ApiDataResponse,
  ApiPaginatedResponse,
} from '@/common/http/api-responses.decorator';
import type { DataResponse, Paginated } from '@/common/http/responses';
import {
  AdminOrderDto,
  AdminOrdersQueryDto,
  ChangeOrderStatusDto,
} from '../dto/admin-order.dto';
import { AdminOrdersService } from '../services/admin-orders.service';

/**
 * Orders: read and moved through their statuses (`new → processing →
 * completed`, or `declined`). No create, edit or delete.
 */
@AdminController('orders')
export class AdminOrdersController {
  constructor(private readonly orders: AdminOrdersService) {}

  /**
   * `q`: an order number, or part of the name, phone or email. Filters:
   * status, userId, from/to (placed between).
   */
  @Get()
  @ApiPaginatedResponse(AdminOrderDto)
  findAll(
    @Query() query: AdminOrdersQueryDto,
  ): Promise<Paginated<AdminOrderDto>> {
    return this.orders.findAll(query);
  }

  /** With its items. */
  @Get(':id')
  @ApiDataResponse(AdminOrderDto)
  @ApiAdminNotFound('order')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DataResponse<AdminOrderDto>> {
    return { data: await this.orders.findOne(id) };
  }

  /** Moves the order to one of its `nextStatuses`. */
  @Post(':id/status')
  @ApiDataResponse(AdminOrderDto)
  @ApiAdminNotFound('order')
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Not allowed from its status (`INVALID_TRANSITION`).',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      'Someone else changed its status meanwhile (`ORDER_STATUS_CHANGED`): reload.',
  })
  async changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeOrderStatusDto,
  ): Promise<DataResponse<AdminOrderDto>> {
    return { data: await this.orders.changeStatus(id, dto) };
  }
}
