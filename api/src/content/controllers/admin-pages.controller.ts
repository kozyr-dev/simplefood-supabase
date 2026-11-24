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
  Put,
  Query,
} from '@nestjs/common';
import { ApiBadRequestResponse } from '@nestjs/swagger';
import { AdminController } from '@/auth/decorators/admin-controller.decorator';
import {
  ApiAdminConflict,
  ApiAdminDeleted,
  ApiAdminNotFound,
} from '@/common/admin/admin-docs';
import { ErrorResponseDto } from '@/common/filters/error-response.dto';
import {
  ApiDataResponse,
  ApiPaginatedResponse,
} from '@/common/http/api-responses.decorator';
import type { DataResponse, Paginated } from '@/common/http/responses';
import {
  AdminPageDto,
  AdminPageSectionDto,
  AdminPageSectionsQueryDto,
  AdminPagesQueryDto,
  CreatePageDto,
  CreatePageSectionDto,
  ReorderDto,
  UpdatePageDto,
  UpdatePageSectionDto,
} from '../dto/admin-content.dto';
import { AdminPageSectionsService } from '../services/admin-page-sections.service';
import { AdminPagesService } from '../services/admin-pages.service';

const SLUG_TAKEN = 'The slug is in use (`SLUG_TAKEN`).';

/** Pages, drafts included; their sections are at /admin/page-sections. */
@AdminController('pages')
export class AdminPagesController {
  constructor(private readonly pages: AdminPagesService) {}

  /** Search title or slug (`q`); filter by state. */
  @Get()
  @ApiPaginatedResponse(AdminPageDto)
  findAll(
    @Query() query: AdminPagesQueryDto,
  ): Promise<Paginated<AdminPageDto>> {
    return this.pages.findAll(query);
  }

  @Get(':id')
  @ApiDataResponse(AdminPageDto)
  @ApiAdminNotFound('page')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DataResponse<AdminPageDto>> {
    return { data: await this.pages.findOne(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiDataResponse(AdminPageDto, { status: HttpStatus.CREATED })
  @ApiAdminConflict(SLUG_TAKEN)
  async create(
    @Body() dto: CreatePageDto,
  ): Promise<DataResponse<AdminPageDto>> {
    return { data: await this.pages.create(dto) };
  }

  /** The homepage keeps its slug (400 `HOME_PAGE`). */
  @Patch(':id')
  @ApiDataResponse(AdminPageDto)
  @ApiAdminNotFound('page')
  @ApiAdminConflict(SLUG_TAKEN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePageDto,
  ): Promise<DataResponse<AdminPageDto>> {
    return { data: await this.pages.update(id, dto) };
  }

  /** With its sections. Not the homepage. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAdminDeleted('page')
  @ApiAdminConflict('The homepage (`HOME_PAGE`).')
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.pages.remove(id);
  }

  /** Puts the page's sections in this order: every section, once. */
  @Put(':id/sections/order')
  @ApiDataResponse(AdminPageSectionDto, { isArray: true })
  @ApiAdminNotFound('page')
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      "The ids are not exactly the page's sections (`ORDER_MISMATCH`): it changed meanwhile.",
  })
  async reorderSections(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderDto,
  ): Promise<DataResponse<AdminPageSectionDto[]>> {
    return { data: await this.pages.reorderSections(id, dto) };
  }
}

/**
 * Page sections. `data` is checked against the section's type and its HTML
 * fields cleaned; errors name fields under `data.` (`data.items.0.title`).
 */
@AdminController('page-sections')
export class AdminPageSectionsController {
  constructor(private readonly sections: AdminPageSectionsService) {}

  /** Filter by `pageId`; in display order by default. */
  @Get()
  @ApiPaginatedResponse(AdminPageSectionDto)
  findAll(
    @Query() query: AdminPageSectionsQueryDto,
  ): Promise<Paginated<AdminPageSectionDto>> {
    return this.sections.findAll(query);
  }

  /** With `references`: the names behind the ids in `data`. */
  @Get(':id')
  @ApiDataResponse(AdminPageSectionDto)
  @ApiAdminNotFound('section')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DataResponse<AdminPageSectionDto>> {
    return { data: await this.sections.findOne(id) };
  }

  /** Added at the end of the page. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiDataResponse(AdminPageSectionDto, { status: HttpStatus.CREATED })
  async create(
    @Body() dto: CreatePageSectionDto,
  ): Promise<DataResponse<AdminPageSectionDto>> {
    return { data: await this.sections.create(dto) };
  }

  /** Replaces the data (the type stays). */
  @Patch(':id')
  @ApiDataResponse(AdminPageSectionDto)
  @ApiAdminNotFound('section')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePageSectionDto,
  ): Promise<DataResponse<AdminPageSectionDto>> {
    return { data: await this.sections.update(id, dto) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAdminDeleted('section')
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.sections.remove(id);
  }
}
