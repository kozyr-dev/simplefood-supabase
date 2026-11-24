import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type FindOptionsWhere, type Repository } from 'typeorm';
import {
  adminOrder,
  contains,
  uniqueViolation,
} from '@/common/admin/admin-list';
import { loadReference, loadReferences } from '@/common/admin/references';
import { sanitizeRichHtml } from '@/common/html/sanitize';
import { paginate, toSkipTake, type Paginated } from '@/common/http/responses';
import { Media } from '@/media/entities/media.entity';
import type {
  AdminProductDto,
  AdminProductsQueryDto,
  CreateProductDto,
  UpdateProductDto,
} from '../dto/admin-product.dto';
import { ProductCategory } from '../entities/product-category.entity';
import { Product } from '../entities/product.entity';
import { toAdminProductDto } from '../mappers/catalog.mappers';

const RELATIONS = { image: true, categories: true } as const;

const UNIQUE = { UQ_product_slug: { field: 'slug', code: 'SLUG_TAKEN' } };

/** Products for the admin app: every product, available or not. */
@Injectable()
export class AdminProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductCategory)
    private readonly categories: Repository<ProductCategory>,
    @InjectRepository(Media) private readonly media: Repository<Media>,
  ) {}

  async findAll(
    query: AdminProductsQueryDto,
  ): Promise<Paginated<AdminProductDto>> {
    const where: FindOptionsWhere<Product> = {};
    if (query.id) where.id = In(query.id);
    if (query.q) where.title = contains(query.q);
    if (query.categoryId) where.categories = { id: query.categoryId };
    if (query.available !== undefined) where.available = query.available;
    if (query.featured !== undefined) where.featured = query.featured;

    // Page the ids first, then load the rows with their relations: a joined
    // to-many relation would make LIMIT count rows of the join. TypeORM's
    // paging query needs the sort column selected too.
    const [page, total] = await this.products.findAndCount({
      select: { id: true, [query.sort]: true },
      where,
      order: adminOrder(query.sort, query.order),
      ...toSkipTake(query),
    });
    const rows = await this.products.find({
      where: { id: In(page.map((row) => row.id)) },
      relations: RELATIONS,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return paginate(
      page.map((row) => toAdminProductDto(byId.get(row.id) as Product)),
      total,
      query,
    );
  }

  async findOne(id: string): Promise<AdminProductDto> {
    return toAdminProductDto(await this.findOrFail(id));
  }

  async create(dto: CreateProductDto): Promise<AdminProductDto> {
    const product = this.products.create({
      available: true,
      featured: false,
      favorite: false,
      image: null,
      categories: [],
      weight: null,
      calories: null,
    });
    await this.apply(product, dto);
    return this.save(product);
  }

  async update(id: string, dto: UpdateProductDto): Promise<AdminProductDto> {
    const product = await this.findOrFail(id);
    await this.apply(product, dto);
    return this.save(product);
  }

  /**
   * Order lines keep their copies (title, price); their product link
   * becomes null.
   */
  async remove(id: string): Promise<void> {
    const { affected } = await this.products.delete(id);
    if (!affected) throw notFound();
  }

  private async apply(product: Product, dto: UpdateProductDto): Promise<void> {
    const { description, imageId, categoryIds, ...fields } = dto;
    Object.assign(product, fields);
    if (description !== undefined) {
      product.description = description
        ? sanitizeRichHtml(description) || null
        : null;
    }
    const image = await loadReference(this.media, imageId, 'imageId');
    if (image !== undefined) product.image = image;
    if (categoryIds) {
      product.categories = await loadReferences(
        this.categories,
        categoryIds,
        'categoryIds',
      );
    }
  }

  private async save(product: Product): Promise<AdminProductDto> {
    try {
      const saved = await this.products.save(product);
      return this.findOne(saved.id);
    } catch (error) {
      throw uniqueViolation(error, UNIQUE) ?? error;
    }
  }

  private async findOrFail(id: string): Promise<Product> {
    const product = await this.products.findOne({
      where: { id },
      relations: RELATIONS,
    });
    if (!product) throw notFound();
    return product;
  }
}

function notFound(): NotFoundException {
  return new NotFoundException('Product not found');
}
