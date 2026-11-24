import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '@/auth/decorators/public.decorator';
import { ErrorResponseDto } from '@/common/filters/error-response.dto';
import {
  ApiDataResponse,
  ApiPaginatedResponse,
} from '@/common/http/api-responses.decorator';
import type { DataResponse, Paginated } from '@/common/http/responses';
import { ListProductsQueryDto } from '../dto/list-products.query.dto';
import { ProductDto } from '../dto/product.dto';
import { ProductsService } from '../services/products.service';

@ApiTags('catalog')
@Public()
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  /** List products, optionally filtered by category, featured or favorite. */
  @Get()
  @ApiPaginatedResponse(ProductDto)
  findAll(
    @Query() query: ListProductsQueryDto,
  ): Promise<Paginated<ProductDto>> {
    return this.products.findAll(query);
  }

  /** One product by its slug. */
  @Get(':slug')
  @ApiDataResponse(ProductDto)
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No product with this slug.',
  })
  async findBySlug(
    @Param('slug') slug: string,
  ): Promise<DataResponse<ProductDto>> {
    return { data: await this.products.findBySlug(slug) };
  }
}
