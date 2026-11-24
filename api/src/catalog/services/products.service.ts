import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { paginate, toSkipTake, type Paginated } from '@/common/http/responses';
import { toProductDto } from '../mappers/catalog.mappers';
import type { ListProductsQueryDto } from '../dto/list-products.query.dto';
import type { ProductDto } from '../dto/product.dto';
import { Product } from '../entities/product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  async findAll(query: ListProductsQueryDto): Promise<Paginated<ProductDto>> {
    const builder = this.products
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.image', 'image')
      // Loads *all* of each product's categories...
      .leftJoinAndSelect('product.categories', 'category');

    if (query.category !== undefined) {
      // ...while this second alias only filters. Filtering on `category`
      // itself would return each product with just the matching category.
      builder.innerJoin(
        'product.categories',
        'filterCategory',
        'filterCategory.slug = :categorySlug',
        { categorySlug: query.category },
      );
    }
    // `false` is a real filter, so compare with undefined, not truthiness.
    if (query.featured !== undefined) {
      builder.andWhere('product.featured = :featured', {
        featured: query.featured,
      });
    }
    if (query.favorite !== undefined) {
      builder.andWhere('product.favorite = :favorite', {
        favorite: query.favorite,
      });
    }

    const { skip, take } = toSkipTake(query);
    const [items, total] = await builder
      .orderBy('product.title', 'ASC')
      // Unique tie-breaker: without it, products with the same title can swap
      // places between pages (shown twice, or never).
      .addOrderBy('product.id', 'ASC')
      // skip/take, not offset/limit: with joins, TypeORM pages by *product*,
      // not by joined row.
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return paginate(items.map(toProductDto), total, query);
  }

  async findBySlug(slug: string): Promise<ProductDto> {
    const product = await this.products.findOne({
      where: { slug },
      relations: { image: true, categories: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return toProductDto(product);
  }
}
