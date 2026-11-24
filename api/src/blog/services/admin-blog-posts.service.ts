import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type FindOptionsWhere, type Repository } from 'typeorm';
import {
  adminOrder,
  contains,
  uniqueViolation,
} from '@/common/admin/admin-list';
import { loadReference, loadReferences } from '@/common/admin/references';
import { paginate, toSkipTake, type Paginated } from '@/common/http/responses';
import { applySeoInput } from '@/common/seo/admin-seo';
import { inPublishState } from '@/database/published';
import { Media } from '@/media/entities/media.entity';
import type {
  AdminBlogPostDto,
  AdminBlogPostsQueryDto,
  CreateBlogPostDto,
  UpdateBlogPostDto,
} from '../dto/admin-blog.dto';
import { BlogCategory } from '../entities/blog-category.entity';
import { BlogPost } from '../entities/blog-post.entity';
import { toAdminBlogPostDto } from '../mappers/blog.mappers';

const RELATIONS = {
  image: true,
  categories: true,
  seo: { shareImage: true },
} as const;

const UNIQUE = { UQ_blog_post_slug: { field: 'slug', code: 'SLUG_TAKEN' } };

/** Every post, drafts and scheduled ones included. */
@Injectable()
export class AdminBlogPostsService {
  constructor(
    @InjectRepository(BlogPost) private readonly posts: Repository<BlogPost>,
    @InjectRepository(BlogCategory)
    private readonly categories: Repository<BlogCategory>,
    @InjectRepository(Media) private readonly media: Repository<Media>,
  ) {}

  async findAll(
    query: AdminBlogPostsQueryDto,
  ): Promise<Paginated<AdminBlogPostDto>> {
    const where: FindOptionsWhere<BlogPost> = {};
    if (query.id) where.id = In(query.id);
    if (query.q) where.title = contains(query.q);
    if (query.categoryId) where.categories = { id: query.categoryId };
    if (query.state) where.publishedAt = inPublishState(query.state);

    // Ids first, then the rows with their relations (see AdminProductsService).
    const [page, total] = await this.posts.findAndCount({
      select: { id: true, [query.sort]: true },
      where,
      order: adminOrder(query.sort, query.order),
      ...toSkipTake(query),
    });
    const rows = await this.posts.find({
      where: { id: In(page.map((row) => row.id)) },
      relations: RELATIONS,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return paginate(
      page.map((row) => toAdminBlogPostDto(byId.get(row.id) as BlogPost)),
      total,
      query,
    );
  }

  async findOne(id: string): Promise<AdminBlogPostDto> {
    return toAdminBlogPostDto(await this.findOrFail(id));
  }

  async create(dto: CreateBlogPostDto): Promise<AdminBlogPostDto> {
    const post = this.posts.create({
      image: null,
      categories: [],
      publishedAt: null,
      seo: { title: null, description: null, shareImage: null },
    });
    await this.apply(post, dto);
    return this.save(post);
  }

  async update(id: string, dto: UpdateBlogPostDto): Promise<AdminBlogPostDto> {
    const post = await this.findOrFail(id);
    await this.apply(post, dto);
    return this.save(post);
  }

  async remove(id: string): Promise<void> {
    const { affected } = await this.posts.delete(id);
    if (!affected) throw notFound();
  }

  private async apply(post: BlogPost, dto: UpdateBlogPostDto): Promise<void> {
    const { imageId, categoryIds, seo, publishedAt, ...fields } = dto;
    Object.assign(post, fields);
    if (publishedAt !== undefined) {
      post.publishedAt = publishedAt === null ? null : new Date(publishedAt);
    }
    const image = await loadReference(this.media, imageId, 'imageId');
    if (image !== undefined) post.image = image;
    if (categoryIds) {
      post.categories = await loadReferences(
        this.categories,
        categoryIds,
        'categoryIds',
      );
    }
    await applySeoInput(post.seo, seo, this.media);
  }

  private async save(post: BlogPost): Promise<AdminBlogPostDto> {
    try {
      const saved = await this.posts.save(post);
      return this.findOne(saved.id);
    } catch (error) {
      throw uniqueViolation(error, UNIQUE) ?? error;
    }
  }

  private async findOrFail(id: string): Promise<BlogPost> {
    const post = await this.posts.findOne({
      where: { id },
      relations: RELATIONS,
    });
    if (!post) throw notFound();
    return post;
  }
}

function notFound(): NotFoundException {
  return new NotFoundException('Blog post not found');
}
