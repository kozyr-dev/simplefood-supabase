import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Media } from '@/media/entities/media.entity';
import { ProductCategory } from './entities/product-category.entity';
import { Product } from './entities/product.entity';
import { AdminProductCategoriesController } from './controllers/admin-product-categories.controller';
import { AdminProductsController } from './controllers/admin-products.controller';
import { ProductCategoriesController } from './controllers/product-categories.controller';
import { AdminProductCategoriesService } from './services/admin-product-categories.service';
import { AdminProductsService } from './services/admin-products.service';
import { ProductCategoriesService } from './services/product-categories.service';
import { ProductsController } from './controllers/products.controller';
import { ProductsService } from './services/products.service';

/** Products and product categories: the public reads and the admin's /api/admin routes. */
@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductCategory, Media])],
  controllers: [
    ProductsController,
    ProductCategoriesController,
    AdminProductsController,
    AdminProductCategoriesController,
  ],
  providers: [
    ProductsService,
    ProductCategoriesService,
    AdminProductsService,
    AdminProductCategoriesService,
  ],
})
export class CatalogModule {}
