import {
  Body,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { AdminController } from '@/auth/decorators/admin-controller.decorator';
import { Roles } from '@/auth/decorators/roles.decorator';
import { ApiAdminDeleted, ApiAdminNotFound } from '@/common/admin/admin-docs';
import {
  ApiDataResponse,
  ApiPaginatedResponse,
  ApiRolesForbidden,
} from '@/common/http/api-responses.decorator';
import type { DataResponse, Paginated } from '@/common/http/responses';
import { UserRole } from '@/users/entities/user.entity';
import {
  AdminContactMessageDto,
  AdminContactMessagesQueryDto,
  UpdateContactMessageDto,
} from '../dto/admin-contact-message.dto';
import { AdminContactMessagesService } from '../services/admin-contact-messages.service';

/** Messages from the site's contact form. */
@AdminController('contact-messages')
export class AdminContactMessagesController {
  constructor(private readonly messages: AdminContactMessagesService) {}

  /** `q`: name, email or message; `handled=false` for the new ones. */
  @Get()
  @ApiPaginatedResponse(AdminContactMessageDto)
  findAll(
    @Query() query: AdminContactMessagesQueryDto,
  ): Promise<Paginated<AdminContactMessageDto>> {
    return this.messages.findAll(query);
  }

  @Get(':id')
  @ApiDataResponse(AdminContactMessageDto)
  @ApiAdminNotFound('message')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DataResponse<AdminContactMessageDto>> {
    return { data: await this.messages.findOne(id) };
  }

  /** Marks it handled, or new again. */
  @Patch(':id')
  @ApiDataResponse(AdminContactMessageDto)
  @ApiAdminNotFound('message')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactMessageDto,
  ): Promise<DataResponse<AdminContactMessageDto>> {
    return { data: await this.messages.update(id, dto) };
  }

  /** Admins only: the shop's record of what customers wrote. */
  @Delete(':id')
  @Roles(UserRole.Admin)
  @ApiRolesForbidden([UserRole.Admin])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAdminDeleted('message')
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.messages.remove(id);
  }
}
