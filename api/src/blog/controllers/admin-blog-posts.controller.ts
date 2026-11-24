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
  AdminBlogPostDto,
  AdminBlogPostsQueryDto,
  CreateBlogPostDto,
  UpdateBlogPostDto,
} from '../dto/admin-blog.dto';
import { AdminBlogPostsService } from '../services/admin-blog-posts.service';

const SLUG_TAKEN = 'The slug is in use (`SLUG_TAKEN`).';

/** Every post, drafts and scheduled ones included. */
@AdminController('blog-posts')
export class AdminBlogPostsController {
  constructor(private readonly service: AdminBlogPostsService) {}

  /** Search by title (`q`); filter by category and state (draft, scheduled, published). */
  @Get()
  @ApiPaginatedResponse(AdminBlogPostDto)
  findAll(
    @Query() query: AdminBlogPostsQueryDto,
  ): Promise<Paginated<AdminBlogPostDto>> {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiDataResponse(AdminBlogPostDto)
  @ApiAdminNotFound('post')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DataResponse<AdminBlogPostDto>> {
    return { data: await this.service.findOne(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiDataResponse(AdminBlogPostDto, { status: HttpStatus.CREATED })
  @ApiAdminConflict(SLUG_TAKEN)
  async create(
    @Body() dto: CreateBlogPostDto,
  ): Promise<DataResponse<AdminBlogPostDto>> {
    return { data: await this.service.create(dto) };
  }

  @Patch(':id')
  @ApiDataResponse(AdminBlogPostDto)
  @ApiAdminNotFound('post')
  @ApiAdminConflict(SLUG_TAKEN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBlogPostDto,
  ): Promise<DataResponse<AdminBlogPostDto>> {
    return { data: await this.service.update(id, dto) };
  }

  /** Deletes the post. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAdminDeleted('post')
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.remove(id);
  }
}
