import { Controller, Get, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '@/auth/decorators/public.decorator';
import { ErrorResponseDto } from '@/common/filters/error-response.dto';
import { ApiDataResponse } from '@/common/http/api-responses.decorator';
import type { DataResponse } from '@/common/http/responses';
import { PageDto } from '../dto/page.dto';
import { PagesService } from '../services/pages.service';

@ApiTags('content')
@Public()
@Controller('pages')
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  /**
   * One published page by its slug, with its sections fully resolved
   * (media, products and categories embedded). The homepage is `home`.
   */
  @Get(':slug')
  @ApiDataResponse(PageDto)
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No published page with this slug.',
  })
  async findBySlug(
    @Param('slug') slug: string,
  ): Promise<DataResponse<PageDto>> {
    return { data: await this.pages.findBySlug(slug) };
  }
}
