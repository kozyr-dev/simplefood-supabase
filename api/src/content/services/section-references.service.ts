import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BlogCategory } from '@/blog/entities/blog-category.entity';
import { Product } from '@/catalog/entities/product.entity';
import type {
  SectionLookups,
  SectionReferences,
} from '../mappers/page.mappers';
import { Media } from '@/media/entities/media.entity';

/** What toProductDto needs loaded. */
const PRODUCT_RELATIONS = { image: true, categories: true } as const;
const BY_TITLE = { title: 'ASC', id: 'ASC' } as const;

/**
 * Loads every row a page's sections refer to: one query per kind of row,
 * run in parallel, skipped when nothing refers to that kind. The query count
 * never depends on how many sections a page has (no N+1).
 */
@Injectable()
export class SectionReferencesService {
  constructor(
    @InjectRepository(Media) private readonly media: Repository<Media>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(BlogCategory)
    private readonly blogCategories: Repository<BlogCategory>,
  ) {}

  async load(refs: SectionReferences): Promise<SectionLookups> {
    const [media, products, productsByCategory, featured, favorite, blog] =
      await Promise.all([
        refs.mediaIds.size
          ? this.media.findBy({ id: In([...refs.mediaIds]) })
          : [],
        // By id, available or not: the mapper filters, keeping the order.
        refs.productIds.size
          ? this.products.find({
              where: { id: In([...refs.productIds]) },
              relations: PRODUCT_RELATIONS,
            })
          : [],
        this.loadProductsByCategory(refs.productCategoryIds),
        refs.featured
          ? this.products.find({
              where: { available: true, featured: true },
              relations: PRODUCT_RELATIONS,
              order: BY_TITLE,
            })
          : [],
        refs.favorite
          ? this.products.find({
              where: { available: true, favorite: true },
              relations: PRODUCT_RELATIONS,
              order: BY_TITLE,
            })
          : [],
        refs.blogCategoryIds.size
          ? this.blogCategories.findBy({ id: In([...refs.blogCategoryIds]) })
          : [],
      ]);

    return {
      media: byId(media),
      products: byId(products),
      productsByCategory,
      featured,
      favorite,
      blogCategories: byId(blog),
    };
  }

  /** Available products of each category, ordered by title, in one query. */
  private async loadProductsByCategory(
    categoryIds: Set<string>,
  ): Promise<Map<string, Product[]>> {
    const result = new Map<string, Product[]>();
    if (!categoryIds.size) {
      return result;
    }

    const products = await this.products
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.image', 'image')
      // Loads *all* of each product's categories (for ProductDto)...
      .leftJoinAndSelect('product.categories', 'category')
      // ...while this second alias only filters.
      .innerJoin(
        'product.categories',
        'filterCategory',
        'filterCategory.id IN (:...categoryIds)',
        { categoryIds: [...categoryIds] },
      )
      .where('product.available = true')
      .orderBy('product.title', 'ASC')
      .addOrderBy('product.id', 'ASC')
      .getMany();

    // A product in two requested categories goes into both lists.
    for (const product of products) {
      for (const category of product.categories) {
        if (categoryIds.has(category.id)) {
          const list = result.get(category.id) ?? [];
          list.push(product);
          result.set(category.id, list);
        }
      }
    }
    return result;
  }
}

function byId<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}
