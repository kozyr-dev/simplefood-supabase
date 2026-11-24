import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@/auth/decorators/public.decorator';
import { ApiDataResponse } from '@/common/http/api-responses.decorator';
import type { DataResponse } from '@/common/http/responses';
import { BlogCategoryDto } from '../dto/blog-category.dto';
import { BlogCategoriesService } from '../services/blog-categories.service';

@ApiTags('blog')
@Public()
@Controller('blog-categories')
export class BlogCategoriesController {
  constructor(private readonly categories: BlogCategoriesService) {}

  /** All blog post categories, in display order. */
  @Get()
  @ApiDataResponse(BlogCategoryDto, { isArray: true })
  async findAll(): Promise<DataResponse<BlogCategoryDto[]>> {
    return { data: await this.categories.findAll() };
  }
}
