import {
  Body,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AdminController } from '@/auth/decorators/admin-controller.decorator';
import {
  ApiAdminConflict,
  ApiAdminDeleted,
  ApiAdminNotFound,
} from '@/common/admin/admin-docs';
import {
  ApiDataResponse,
  ApiPaginatedResponse,
} from '@/common/http/api-responses.decorator';
import type { DataResponse, Paginated } from '@/common/http/responses';
import {
  AdminProductDto,
  AdminProductsQueryDto,
  CreateProductDto,
  UpdateProductDto,
} from '../dto/admin-product.dto';
import { AdminProductsService } from '../services/admin-products.service';

const SLUG_TAKEN = 'The slug is in use (`SLUG_TAKEN`).';

/** Every product, available or not; prices in kopiykas. */
@AdminController('products')
export class AdminProductsController {
  constructor(private readonly products: AdminProductsService) {}

  /** Search by title (`q`); filter by category, availability, featured. */
  @Get()
  @ApiPaginatedResponse(AdminProductDto)
  findAll(
    @Query() query: AdminProductsQueryDto,
  ): Promise<Paginated<AdminProductDto>> {
    return this.products.findAll(query);
  }

  @Get(':id')
  @ApiDataResponse(AdminProductDto)
  @ApiAdminNotFound('product')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DataResponse<AdminProductDto>> {
    return { data: await this.products.findOne(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiDataResponse(AdminProductDto, { status: HttpStatus.CREATED })
  @ApiAdminConflict(SLUG_TAKEN)
  async create(
    @Body() dto: CreateProductDto,
  ): Promise<DataResponse<AdminProductDto>> {
    return { data: await this.products.create(dto) };
  }

  @Patch(':id')
  @ApiDataResponse(AdminProductDto)
  @ApiAdminNotFound('product')
  @ApiAdminConflict(SLUG_TAKEN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<DataResponse<AdminProductDto>> {
    return { data: await this.products.update(id, dto) };
  }

  /** Past orders keep the product's title and price. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAdminDeleted('product')
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.products.remove(id);
  }
}
