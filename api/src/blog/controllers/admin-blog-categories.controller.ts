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
  AdminBlogCategoryDto,
  AdminBlogCategoriesQueryDto,
  CreateBlogCategoryDto,
  UpdateBlogCategoryDto,
} from '../dto/admin-blog.dto';
import { AdminBlogCategoriesService } from '../services/admin-blog-categories.service';

const SLUG_TAKEN = 'The slug is in use (`SLUG_TAKEN`).';

/** Blog categories. */
@AdminController('blog-categories')
export class AdminBlogCategoriesController {
  constructor(private readonly service: AdminBlogCategoriesService) {}

  /** Search by name (`q`). */
  @Get()
  @ApiPaginatedResponse(AdminBlogCategoryDto)
  findAll(
    @Query() query: AdminBlogCategoriesQueryDto,
  ): Promise<Paginated<AdminBlogCategoryDto>> {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiDataResponse(AdminBlogCategoryDto)
  @ApiAdminNotFound('category')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DataResponse<AdminBlogCategoryDto>> {
    return { data: await this.service.findOne(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiDataResponse(AdminBlogCategoryDto, { status: HttpStatus.CREATED })
  @ApiAdminConflict(SLUG_TAKEN)
  async create(
    @Body() dto: CreateBlogCategoryDto,
  ): Promise<DataResponse<AdminBlogCategoryDto>> {
    return { data: await this.service.create(dto) };
  }

  @Patch(':id')
  @ApiDataResponse(AdminBlogCategoryDto)
  @ApiAdminNotFound('category')
  @ApiAdminConflict(SLUG_TAKEN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBlogCategoryDto,
  ): Promise<DataResponse<AdminBlogCategoryDto>> {
    return { data: await this.service.update(id, dto) };
  }

  /** Refused while posts are in it. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAdminDeleted('category')
  @ApiAdminConflict('Posts are in it (`CATEGORY_IN_USE`).')
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.remove(id);
  }
}
