import { PartialType } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { AdminListQueryDto } from '@/common/admin/admin-list-query.dto';
import { IsSlug } from '@/common/validation/slug';

export class AdminProductCategoryDto {
  id: string;
  /** @example "Піца" */
  name: string;
  /** @example "pizza" */
  slug: string;
  /** Display order: lower first. */
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export const PRODUCT_CATEGORY_SORTS = [
  'id',
  'name',
  'position',
  'createdAt',
] as const;

export class AdminProductCategoriesQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsIn(PRODUCT_CATEGORY_SORTS)
  sort: string = 'position';
}

export class CreateProductCategoryDto {
  @IsString()
  @Length(1, 100)
  name: string;

  @IsSlug(100)
  slug: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  position?: number;
}

export class UpdateProductCategoryDto extends PartialType(
  CreateProductCategoryDto,
  { skipNullProperties: false },
) {}
