import {
  Body,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { ApiAdminNotFound } from '@/common/admin/admin-docs';
import { ErrorResponseDto } from '@/common/filters/error-response.dto';
import {
  ApiDataResponse,
  ApiPaginatedResponse,
} from '@/common/http/api-responses.decorator';
import type { DataResponse, Paginated } from '@/common/http/responses';
import { UserRole } from '@/users/entities/user.entity';
import { AdminController } from '../decorators/admin-controller.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import {
  AdminUserDto,
  AdminUsersQueryDto,
  UpdateUserDto,
} from '../dto/admin-user.dto';
import { AdminUsersService } from '../services/admin-users.service';
import type { AuthUser } from '../types/auth.types';

/** Accounts: admins only. New staff come from `npm run admin:create`. */
@AdminController('users', [UserRole.Admin])
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  /** `q`: name or email; filters: role, blocked. */
  @Get()
  @ApiPaginatedResponse(AdminUserDto)
  findAll(
    @Query() query: AdminUsersQueryDto,
  ): Promise<Paginated<AdminUserDto>> {
    return this.users.findAll(query);
  }

  @Get(':id')
  @ApiDataResponse(AdminUserDto)
  @ApiAdminNotFound('user')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DataResponse<AdminUserDto>> {
    return { data: await this.users.findOne(id) };
  }

  /**
   * Role and blocking. A block or a role change ends every session; the
   * access token in hand still works until it expires (at most 15 minutes).
   */
  @Patch(':id')
  @ApiDataResponse(AdminUserDto)
  @ApiAdminNotFound('user')
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Your own account (`OWN_ACCOUNT`).',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'It would leave no active admin (`LAST_ADMIN`).',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() caller: AuthUser,
  ): Promise<DataResponse<AdminUserDto>> {
    return { data: await this.users.update(id, dto, caller) };
  }

  /** Emails the account a password-reset link (none to a blocked account). */
  @Post(':id/password-reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'The link is on its way.' })
  @ApiAdminNotFound('user')
  async sendPasswordReset(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.users.sendPasswordReset(id);
  }
}
