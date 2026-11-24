import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { toProductCategoryDto } from '../mappers/catalog.mappers';
import type { ProductCategoryDto } from '../dto/product-category.dto';
import { ProductCategory } from '../entities/product-category.entity';

@Injectable()
export class ProductCategoriesService {
  constructor(
    @InjectRepository(ProductCategory)
    private readonly categories: Repository<ProductCategory>,
  ) {}

  async findAll(): Promise<ProductCategoryDto[]> {
    const categories = await this.categories.find({
      order: { position: 'ASC', name: 'ASC' },
    });
    return categories.map(toProductCategoryDto);
  }
}
