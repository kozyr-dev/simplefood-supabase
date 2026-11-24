import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';
import { AdminListQueryDto } from '@/common/admin/admin-list-query.dto';
import { AdminSeoDto, SeoInputDto } from '@/common/seo/seo-input.dto';
import { IsSlug } from '@/common/validation/slug';
import { PublishState } from '@/database/published';
import { MediaDto } from '@/media/dto/media.dto';

export class AdminBlogPostDto {
  id: string;
  slug: string;
  title: string;
  /** Markdown. */
  text: string;
  imageId: string | null;
  /** For thumbnails; read-only (set `imageId`). */
  image: MediaDto | null;
  categoryIds: string[];
  seo: AdminSeoDto;
  /** null: a draft; a future date: scheduled. */
  publishedAt: Date | null;
  /** Read-only, from `publishedAt`. */
  state: PublishState;
  createdAt: Date;
  updatedAt: Date;
}

export const BLOG_POST_SORTS = [
  'id',
  'title',
  'publishedAt',
  'createdAt',
  'updatedAt',
] as const;

export class AdminBlogPostsQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsIn(BLOG_POST_SORTS)
  sort: string = 'createdAt';

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(PublishState)
  state?: PublishState;
}

export class CreateBlogPostDto {
  @IsSlug(150)
  slug: string;

  @IsString()
  @Length(1, 255)
  title: string;

  /** Markdown; the site never runs HTML in it. */
  @IsString()
  @Length(1, 100_000)
  text: string;

  @IsOptional()
  @IsUUID()
  imageId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  categoryIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SeoInputDto)
  seo?: SeoInputDto;

  /** ISO 8601; null or missing: a draft. A future date schedules it. */
  @IsOptional()
  @IsISO8601({ strict: true })
  publishedAt?: string | null;
}

export class UpdateBlogPostDto extends PartialType(CreateBlogPostDto, {
  skipNullProperties: false,
}) {}

export class AdminBlogCategoryDto {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export class AdminBlogCategoriesQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsIn(['id', 'name', 'createdAt'])
  sort: string = 'name';
}

export class CreateBlogCategoryDto {
  @IsString()
  @Length(1, 100)
  name: string;

  @IsSlug(100)
  slug: string;
}

export class UpdateBlogCategoryDto extends PartialType(CreateBlogCategoryDto, {
  skipNullProperties: false,
}) {}
