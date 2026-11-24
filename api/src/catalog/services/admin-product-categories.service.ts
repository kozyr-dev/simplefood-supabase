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
  AdminProductCategoriesQueryDto,
  AdminProductCategoryDto,
  CreateProductCategoryDto,
  UpdateProductCategoryDto,
} from '../dto/admin-product-category.dto';
import { ProductCategory } from '../entities/product-category.entity';
import { Product } from '../entities/product.entity';
import { toAdminProductCategoryDto } from '../mappers/catalog.mappers';

const UNIQUE = {
  UQ_product_category_slug: { field: 'slug', code: 'SLUG_TAKEN' },
};

@Injectable()
export class AdminProductCategoriesService {
  constructor(
    @InjectRepository(ProductCategory)
    private readonly categories: Repository<ProductCategory>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  async findAll(
    query: AdminProductCategoriesQueryDto,
  ): Promise<Paginated<AdminProductCategoryDto>> {
    const where: FindOptionsWhere<ProductCategory> = {};
    if (query.id) where.id = In(query.id);
    if (query.q) where.name = contains(query.q);
    const [rows, total] = await this.categories.findAndCount({
      where,
      order: adminOrder(query.sort, query.order),
      ...toSkipTake(query),
    });
    return paginate(rows.map(toAdminProductCategoryDto), total, query);
  }

  async findOne(id: string): Promise<AdminProductCategoryDto> {
    return toAdminProductCategoryDto(await this.findOrFail(id));
  }

  create(dto: CreateProductCategoryDto): Promise<AdminProductCategoryDto> {
    return this.save(
      Object.assign(this.categories.create({ position: 0 }), dto),
    );
  }

  async update(
    id: string,
    dto: UpdateProductCategoryDto,
  ): Promise<AdminProductCategoryDto> {
    return this.save(Object.assign(await this.findOrFail(id), dto));
  }

  /**
   * Refused while products are in it (409 `CATEGORY_IN_USE`): deleting
   * would silently take them out of the category, and of the menu pages
   * that list it.
   */
  async remove(id: string): Promise<void> {
    await this.findOrFail(id);
    const inUse = await this.products.count({
      where: { categories: { id } },
    });
    if (inUse) {
      throw new ConflictException({
        message: `${inUse} product(s) are in this category; move them first`,
        code: 'CATEGORY_IN_USE',
      });
    }
    await this.categories.delete(id);
  }

  private async save(
    category: ProductCategory,
  ): Promise<AdminProductCategoryDto> {
    try {
      return toAdminProductCategoryDto(await this.categories.save(category));
    } catch (error) {
      throw uniqueViolation(error, UNIQUE) ?? error;
    }
  }

  private async findOrFail(id: string): Promise<ProductCategory> {
    const category = await this.categories.findOneBy({ id });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }
}
