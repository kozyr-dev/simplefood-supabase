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
import { ApiAdminDeleted, ApiAdminNotFound } from '@/common/admin/admin-docs';
import { ErrorResponseDto } from '@/common/filters/error-response.dto';
import {
  ApiDataResponse,
  ApiPaginatedResponse,
} from '@/common/http/api-responses.decorator';
import {
  paginate,
  type DataResponse,
  type Paginated,
} from '@/common/http/responses';
import {
  AdminMenuDto,
  AdminMenuItemDto,
  AdminMenuItemsQueryDto,
  CreateMenuItemDto,
  ReorderMenuItemsDto,
  UpdateMenuItemDto,
} from '../dto/admin-content.dto';
import { AdminMenusService } from '../services/admin-menus.service';

const ORDER_MISMATCH = {
  type: ErrorResponseDto,
  description:
    "The ids are not exactly the list's items (`ORDER_MISMATCH`): it changed meanwhile.",
};

/** The three menus; their items are at /admin/menu-items. */
@AdminController('menus')
export class AdminMenusController {
  constructor(private readonly menus: AdminMenusService) {}

  /** Header, footer, dropdown, with their item counts (one page, no paging). */
  @Get()
  @ApiPaginatedResponse(AdminMenuDto)
  async findAll(): Promise<Paginated<AdminMenuDto>> {
    const menus = await this.menus.findAllMenus();
    return paginate(menus, menus.length, {
      page: 1,
      pageSize: Math.max(menus.length, 1),
    });
  }

  @Get(':id')
  @ApiDataResponse(AdminMenuDto)
  @ApiAdminNotFound('menu')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DataResponse<AdminMenuDto>> {
    return { data: await this.menus.findMenu(id) };
  }

  /** Puts one group's items in this order: every item of the group, once. */
  @Put(':id/items/order')
  @ApiDataResponse(AdminMenuItemDto, { isArray: true })
  @ApiAdminNotFound('menu')
  @ApiBadRequestResponse(ORDER_MISMATCH)
  async reorder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderMenuItemsDto,
  ): Promise<DataResponse<AdminMenuItemDto[]>> {
    return { data: await this.menus.reorder(id, dto) };
  }
}

/** The menus' links. */
@AdminController('menu-items')
export class AdminMenuItemsController {
  constructor(private readonly menus: AdminMenusService) {}

  /** Filter by `menuId` and `group`; in display order by default. */
  @Get()
  @ApiPaginatedResponse(AdminMenuItemDto)
  findAll(
    @Query() query: AdminMenuItemsQueryDto,
  ): Promise<Paginated<AdminMenuItemDto>> {
    return this.menus.findItems(query);
  }

  @Get(':id')
  @ApiDataResponse(AdminMenuItemDto)
  @ApiAdminNotFound('menu item')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DataResponse<AdminMenuItemDto>> {
    return { data: await this.menus.findItem(id) };
  }

  /** Added at the end of its group. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiDataResponse(AdminMenuItemDto, { status: HttpStatus.CREATED })
  async create(
    @Body() dto: CreateMenuItemDto,
  ): Promise<DataResponse<AdminMenuItemDto>> {
    return { data: await this.menus.createItem(dto) };
  }

  @Patch(':id')
  @ApiDataResponse(AdminMenuItemDto)
  @ApiAdminNotFound('menu item')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuItemDto,
  ): Promise<DataResponse<AdminMenuItemDto>> {
    return { data: await this.menus.updateItem(id, dto) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAdminDeleted('menu item')
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.menus.removeItem(id);
  }
}
