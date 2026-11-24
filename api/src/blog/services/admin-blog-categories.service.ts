import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type FindOptionsWhere, type Repository } from 'typeorm';
import {
  adminOrder,
  contains,
  uniqueViolation,
} from '@/common/admin/admin-list';
import { paginate, toSkipTake, type Paginated } from '@/common/http/responses';
import type {
  AdminBlogCategoriesQueryDto,
  AdminBlogCategoryDto,
  CreateBlogCategoryDto,
  UpdateBlogCategoryDto,
} from '../dto/admin-blog.dto';
import { BlogCategory } from '../entities/blog-category.entity';
import { BlogPost } from '../entities/blog-post.entity';
import { toAdminBlogCategoryDto } from '../mappers/blog.mappers';

const UNIQUE = {
  UQ_blog_category_slug: { field: 'slug', code: 'SLUG_TAKEN' },
};

@Injectable()
export class AdminBlogCategoriesService {
  constructor(
    @InjectRepository(BlogCategory)
    private readonly categories: Repository<BlogCategory>,
    @InjectRepository(BlogPost) private readonly posts: Repository<BlogPost>,
  ) {}

  async findAll(
    query: AdminBlogCategoriesQueryDto,
  ): Promise<Paginated<AdminBlogCategoryDto>> {
    const where: FindOptionsWhere<BlogCategory> = {};
    if (query.id) where.id = In(query.id);
    if (query.q) where.name = contains(query.q);
    const [rows, total] = await this.categories.findAndCount({
      where,
      order: adminOrder(query.sort, query.order),
      ...toSkipTake(query),
    });
    return paginate(rows.map(toAdminBlogCategoryDto), total, query);
  }

  async findOne(id: string): Promise<AdminBlogCategoryDto> {
    return toAdminBlogCategoryDto(await this.findOrFail(id));
  }

  create(dto: CreateBlogCategoryDto): Promise<AdminBlogCategoryDto> {
    return this.save(this.categories.create(dto));
  }

  async update(
    id: string,
    dto: UpdateBlogCategoryDto,
  ): Promise<AdminBlogCategoryDto> {
    return this.save(Object.assign(await this.findOrFail(id), dto));
  }

  /**
   * Refused while posts are in it (409 `CATEGORY_IN_USE`). A news section
   * showing a deleted category shows every post instead.
   */
  async remove(id: string): Promise<void> {
    await this.findOrFail(id);
    const inUse = await this.posts.count({ where: { categories: { id } } });
    if (inUse) {
      throw new ConflictException({
        message: `${inUse} post(s) are in this category; move them first`,
        code: 'CATEGORY_IN_USE',
      });
    }
    await this.categories.delete(id);
  }

  private async save(category: BlogCategory): Promise<AdminBlogCategoryDto> {
    try {
      return toAdminBlogCategoryDto(await this.categories.save(category));
    } catch (error) {
      throw uniqueViolation(error, UNIQUE) ?? error;
    }
  }

  private async findOrFail(id: string): Promise<BlogCategory> {
    const category = await this.categories.findOneBy({ id });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }
}
