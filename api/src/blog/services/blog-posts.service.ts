import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { paginate, toSkipTake, type Paginated } from '@/common/http/responses';
import { toBlogPostDto, toBlogPostSummaryDto } from '../mappers/blog.mappers';
import type { ListBlogPostsQueryDto } from '../dto/list-blog-posts.query.dto';
import type { BlogPostSummaryDto } from '../dto/blog-post-summary.dto';
import type { BlogPostDto } from '../dto/blog-post.dto';
import { BlogPost } from '../entities/blog-post.entity';
import { isPublishedNow } from '@/database/published';

/** Public reads: drafts and scheduled posts behave as if they don't exist. */
@Injectable()
export class BlogPostsService {
  constructor(
    @InjectRepository(BlogPost)
    private readonly blogPosts: Repository<BlogPost>,
  ) {}

  async findAll(
    query: ListBlogPostsQueryDto,
  ): Promise<Paginated<BlogPostSummaryDto>> {
    const builder = this.blogPosts
      .createQueryBuilder('blogPost')
      .leftJoinAndSelect('blogPost.image', 'image')
      // Loads *all* of each blog post's categories...
      .leftJoinAndSelect('blogPost.categories', 'category')
      .where({ publishedAt: isPublishedNow() });

    if (query.category !== undefined) {
      // ...while this second alias only filters. Filtering on `category`
      // itself would return each blog post with just the matching category.
      builder.innerJoin(
        'blogPost.categories',
        'filterCategory',
        'filterCategory.slug = :categorySlug',
        { categorySlug: query.category },
      );
    }

    const { skip, take } = toSkipTake(query);
    const [items, total] = await builder
      // Newest first.
      .orderBy('blogPost.publishedAt', 'DESC')
      // Unique tie-breaker: without it, posts published at the same moment
      // can swap places between pages (shown twice, or never).
      .addOrderBy('blogPost.id', 'DESC')
      // skip/take, not offset/limit: with joins, TypeORM pages by *blog post*,
      // not by joined row.
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return paginate(items.map(toBlogPostSummaryDto), total, query);
  }

  async findBySlug(slug: string): Promise<BlogPostDto> {
    const blogPost = await this.blogPosts.findOne({
      where: { slug, publishedAt: isPublishedNow() },
      relations: { image: true, categories: true, seo: { shareImage: true } },
    });
    // Same 404 for unknown, draft and scheduled: don't reveal unpublished slugs.
    if (!blogPost) {
      throw new NotFoundException('Blog post not found');
    }
    return toBlogPostDto(blogPost);
  }
}
