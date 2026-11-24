import { Body, Get, Patch } from '@nestjs/common';
import { AdminController } from '@/auth/decorators/admin-controller.decorator';
import { ApiDataResponse } from '@/common/http/api-responses.decorator';
import type { DataResponse } from '@/common/http/responses';
import { AdminSettingsDto, UpdateSettingsDto } from '../dto/admin-content.dto';
import { AdminSettingsService } from '../services/admin-settings.service';

/** The site's one settings record. */
@AdminController('settings')
export class AdminSettingsController {
  constructor(private readonly settings: AdminSettingsService) {}

  /** Empty fields until the first save. */
  @Get()
  @ApiDataResponse(AdminSettingsDto)
  async get(): Promise<DataResponse<AdminSettingsDto>> {
    return { data: await this.settings.get() };
  }

  /** The fields sent change; `null` clears an optional one. */
  @Patch()
  @ApiDataResponse(AdminSettingsDto)
  async update(
    @Body() dto: UpdateSettingsDto,
  ): Promise<DataResponse<AdminSettingsDto>> {
    return { data: await this.settings.update(dto) };
  }
}
