import { Controller, Get } from '@nestjs/common';
import { ApiNotFoundResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '@/auth/decorators/public.decorator';
import { ErrorResponseDto } from '@/common/filters/error-response.dto';
import { ApiDataResponse } from '@/common/http/api-responses.decorator';
import type { DataResponse } from '@/common/http/responses';
import { SettingsDto } from '../dto/settings.dto';
import { SettingsService } from '../services/settings.service';

@ApiTags('content')
@Public()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Site-wide settings: name, contacts, opening hours, default SEO. */
  @Get()
  @ApiDataResponse(SettingsDto)
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Settings have not been created yet.',
  })
  async get(): Promise<DataResponse<SettingsDto>> {
    return { data: await this.settings.get() };
  }
}
