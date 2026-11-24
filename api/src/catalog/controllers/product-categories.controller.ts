import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@/auth/decorators/public.decorator';
import { ApiDataResponse } from '@/common/http/api-responses.decorator';
import type { DataResponse } from '@/common/http/responses';
import { ProductCategoryDto } from '../dto/product-category.dto';
import { ProductCategoriesService } from '../services/product-categories.service';

@ApiTags('catalog')
@Public()
@Controller('product-categories')
export class ProductCategoriesController {
  constructor(private readonly categories: ProductCategoriesService) {}

  /** All product categories, in display order. */
  @Get()
  @ApiDataResponse(ProductCategoryDto, { isArray: true })
  async findAll(): Promise<DataResponse<ProductCategoryDto[]>> {
    return { data: await this.categories.findAll() };
  }
}
