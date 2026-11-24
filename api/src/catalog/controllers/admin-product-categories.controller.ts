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
  AdminProductCategoryDto,
  AdminProductCategoriesQueryDto,
  CreateProductCategoryDto,
  UpdateProductCategoryDto,
} from '../dto/admin-product-category.dto';
import { AdminProductCategoriesService } from '../services/admin-product-categories.service';

const SLUG_TAKEN = 'The slug is in use (`SLUG_TAKEN`).';

/** Product categories, in display order (`position`). */
@AdminController('product-categories')
export class AdminProductCategoriesController {
  constructor(private readonly categories: AdminProductCategoriesService) {}

  /** Search by name (`q`). */
  @Get()
  @ApiPaginatedResponse(AdminProductCategoryDto)
  findAll(
    @Query() query: AdminProductCategoriesQueryDto,
  ): Promise<Paginated<AdminProductCategoryDto>> {
    return this.categories.findAll(query);
  }

  @Get(':id')
  @ApiDataResponse(AdminProductCategoryDto)
  @ApiAdminNotFound('category')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DataResponse<AdminProductCategoryDto>> {
    return { data: await this.categories.findOne(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiDataResponse(AdminProductCategoryDto, { status: HttpStatus.CREATED })
  @ApiAdminConflict(SLUG_TAKEN)
  async create(
    @Body() dto: CreateProductCategoryDto,
  ): Promise<DataResponse<AdminProductCategoryDto>> {
    return { data: await this.categories.create(dto) };
  }

  @Patch(':id')
  @ApiDataResponse(AdminProductCategoryDto)
  @ApiAdminNotFound('category')
  @ApiAdminConflict(SLUG_TAKEN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductCategoryDto,
  ): Promise<DataResponse<AdminProductCategoryDto>> {
    return { data: await this.categories.update(id, dto) };
  }

  /** Refused while products are in it. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAdminDeleted('category')
  @ApiAdminConflict('Products are in it (`CATEGORY_IN_USE`).')
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.categories.remove(id);
  }
}
