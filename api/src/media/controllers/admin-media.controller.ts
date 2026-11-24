import { Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiNotFoundResponse } from '@nestjs/swagger';
import { AdminController } from '@/auth/decorators/admin-controller.decorator';
import { ErrorResponseDto } from '@/common/filters/error-response.dto';
import {
  ApiDataResponse,
  ApiPaginatedResponse,
} from '@/common/http/api-responses.decorator';
import type { DataResponse, Paginated } from '@/common/http/responses';
import { AdminMediaDto, AdminMediaQueryDto } from '../dto/admin-media.dto';
import { AdminMediaService } from '../services/admin-media.service';

/**
 * The image library for the admin app: browsing and picking. Uploading,
 * editing and deleting stay at /api/media (MediaService does the work).
 */
@AdminController('media')
export class AdminMediaController {
  constructor(private readonly media: AdminMediaService) {}

  /** Search by file name (`q`), filter by folder. */
  @Get()
  @ApiPaginatedResponse(AdminMediaDto)
  findAll(
    @Query() query: AdminMediaQueryDto,
  ): Promise<Paginated<AdminMediaDto>> {
    return this.media.findAll(query);
  }

  @Get(':id')
  @ApiDataResponse(AdminMediaDto)
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No such image.',
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DataResponse<AdminMediaDto>> {
    return { data: await this.media.findOne(id) };
  }
}
