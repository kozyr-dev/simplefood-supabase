import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { toBlogCategoryDto } from '../mappers/blog.mappers';
import type { BlogCategoryDto } from '../dto/blog-category.dto';
import { BlogCategory } from '../entities/blog-category.entity';

@Injectable()
export class BlogCategoriesService {
  constructor(
    @InjectRepository(BlogCategory)
    private readonly categories: Repository<BlogCategory>,
  ) {}

  async findAll(): Promise<BlogCategoryDto[]> {
    const categories = await this.categories.find({
      // `id` breaks ties, so equal names keep a stable order.
      order: { name: 'ASC', id: 'ASC' },
    });
    return categories.map(toBlogCategoryDto);
  }
}
