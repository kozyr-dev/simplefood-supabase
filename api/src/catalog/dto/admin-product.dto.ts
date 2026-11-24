import { PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AdminListQueryDto } from '@/common/admin/admin-list-query.dto';
import { ToBoolean } from '@/common/http/query-transforms';
import { IsSlug } from '@/common/validation/slug';
import { MediaDto } from '@/media/dto/media.dto';

/** A product as the admin app edits it: flat, references as ids. */
export class AdminProductDto {
  id: string;
  /** @example "borscht" */
  slug: string;
  /** @example "Борщ" */
  title: string;
  /** HTML, cleaned on save. */
  description: string | null;
  /** Kopiykas. @example 18900 */
  price: number;
  /** Grams. */
  weight: number | null;
  calories: number | null;
  available: boolean;
  featured: boolean;
  favorite: boolean;
  imageId: string | null;
  /** For thumbnails; read-only (set `imageId`). */
  image: MediaDto | null;
  categoryIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export const PRODUCT_SORTS = [
  'id',
  'title',
  'price',
  'createdAt',
  'updatedAt',
] as const;

export class AdminProductsQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort: string = 'title';

  /** Only products in this category. */
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  featured?: boolean;
}

/** 1 000 000 ₴: a typo guard, far above any real price. */
const MAX_PRICE = 100_000_000;

export class CreateProductDto {
  @IsSlug(150)
  slug: string;

  @IsString()
  @Length(1, 255)
  title: string;

  /** HTML; scripts, handlers and unknown tags are removed on save. */
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string | null;

  /** Kopiykas: 18900 is 189.00 ₴. */
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE)
  price: number;

  /** Grams, more than 0. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  weight?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  calories?: number | null;

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsBoolean()
  favorite?: boolean;

  @IsOptional()
  @IsUUID()
  imageId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  categoryIds?: string[];
}

/** The fields sent change; `null` clears an optional one (never a required one). */
export class UpdateProductDto extends PartialType(CreateProductDto, {
  skipNullProperties: false,
}) {}
