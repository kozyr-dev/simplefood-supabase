import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '@/auth/decorators/public.decorator';
import { ErrorResponseDto } from '@/common/filters/error-response.dto';
import {
  ApiDataResponse,
  ApiPaginatedResponse,
} from '@/common/http/api-responses.decorator';
import type { DataResponse, Paginated } from '@/common/http/responses';
import { ListBlogPostsQueryDto } from '../dto/list-blog-posts.query.dto';
import { BlogPostSummaryDto } from '../dto/blog-post-summary.dto';
import { BlogPostDto } from '../dto/blog-post.dto';
import { BlogPostsService } from '../services/blog-posts.service';

@ApiTags('blog')
@Public()
@Controller('blog-posts')
export class BlogPostsController {
  constructor(private readonly blogPosts: BlogPostsService) {}

  /**
   * Published blog posts, newest first, optionally filtered by category.
   * Items carry a plain-text `excerpt`; the full `text` is on the detail.
   */
  @Get()
  @ApiPaginatedResponse(BlogPostSummaryDto)
  findAll(
    @Query() query: ListBlogPostsQueryDto,
  ): Promise<Paginated<BlogPostSummaryDto>> {
    return this.blogPosts.findAll(query);
  }

  /** One published blog post by its slug. */
  @Get(':slug')
  @ApiDataResponse(BlogPostDto)
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No published blog post with this slug.',
  })
  async findBySlug(
    @Param('slug') slug: string,
  ): Promise<DataResponse<BlogPostDto>> {
    return { data: await this.blogPosts.findBySlug(slug) };
  }
}
