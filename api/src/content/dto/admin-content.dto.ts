import { OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AdminListQueryDto } from '@/common/admin/admin-list-query.dto';
import { AdminSeoDto, SeoInputDto } from '@/common/seo/seo-input.dto';
import { IsSlug } from '@/common/validation/slug';
import { PublishState } from '@/database/published';
import { MenuItemGroup } from '../entities/menu-item.entity';
import { MenuKey } from '../entities/menu.entity';
import { SectionType } from '../entities/page-section.entity';

/* ---------- Settings (one record, id 1) ---------- */

export class AdminSettingsDto {
  /** Always 1: there is one settings record. */
  id: number;
  siteName: string;
  phone: string | null;
  address: string | null;
  workingHours: string | null;
  takingOrdersHours: string | null;
  facebook: string | null;
  instagram: string | null;
  seo: AdminSeoDto;
  updatedAt: Date | null;
}

const SOCIAL_URL = { protocols: ['https'], require_protocol: true };

class SettingsFieldsDto {
  @IsString()
  @Length(1, 100)
  siteName: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  workingHours?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  takingOrdersHours?: string | null;

  /** https only. */
  @IsOptional()
  @IsUrl(SOCIAL_URL)
  @MaxLength(500)
  facebook?: string | null;

  /** https only. */
  @IsOptional()
  @IsUrl(SOCIAL_URL)
  @MaxLength(500)
  instagram?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => SeoInputDto)
  seo?: SeoInputDto;
}

/**
 * The fields sent change; `null` clears an optional one. A mapped type, so
 * an instance holds only the keys sent (declared fields would all be
 * present, as `undefined`).
 */
export class UpdateSettingsDto extends PartialType(SettingsFieldsDto, {
  skipNullProperties: false,
}) {}

/* ---------- Menus and their items ---------- */

export class AdminMenuDto {
  id: string;
  key: MenuKey;
  itemCount: number;
}

export class AdminMenuItemDto {
  id: string;
  menuId: string;
  title: string;
  link: string;
  className: string | null;
  group: MenuItemGroup;
  position: number;
}

export class AdminMenuItemsQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsIn(['id', 'position', 'title'])
  sort: string = 'position';

  @IsOptional()
  @IsUUID()
  menuId?: string;

  @IsOptional()
  @IsEnum(MenuItemGroup)
  group?: MenuItemGroup;
}

export class CreateMenuItemDto {
  @IsUUID()
  menuId: string;

  @IsString()
  @Length(1, 100)
  title: string;

  /** `/simple-menu`, `#contacts`, `https://…`: not checked as a URL. */
  @IsString()
  @Length(1, 500)
  @Matches(/^(?!\s*(?:javascript|data|vbscript):)/i, {
    message: 'link must not be a script URL',
  })
  link: string;

  @IsOptional()
  @Matches(/^[\w-]+(?: [\w-]+)*$/, {
    message: 'className must be CSS class names',
  })
  @MaxLength(100)
  className?: string | null;

  /** `main` unless given. */
  @IsOptional()
  @IsEnum(MenuItemGroup)
  group?: MenuItemGroup;
}

/** The menu can't change; reorder with PUT /admin/menus/:id/items/order. */
export class UpdateMenuItemDto extends PartialType(
  OmitType(CreateMenuItemDto, ['menuId'] as const),
  { skipNullProperties: false },
) {}

/* ---------- Ordering (sections, menu items) ---------- */

export class ReorderDto {
  /** Every id of the list, in the new order; nothing missing, nothing extra. */
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  ids: string[];
}

export class ReorderMenuItemsDto extends ReorderDto {
  @IsEnum(MenuItemGroup)
  group: MenuItemGroup;
}

/* ---------- Pages ---------- */

export class AdminPageDto {
  id: string;
  /** `home` is the homepage. */
  slug: string;
  title: string;
  seo: AdminSeoDto;
  publishedAt: Date | null;
  state: PublishState;
  sectionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export class AdminPagesQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsIn(['id', 'title', 'slug', 'publishedAt', 'updatedAt'])
  sort: string = 'title';

  @IsOptional()
  @IsEnum(PublishState)
  state?: PublishState;
}

export class CreatePageDto {
  @IsSlug(150)
  slug: string;

  @IsString()
  @Length(1, 255)
  title: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SeoInputDto)
  seo?: SeoInputDto;

  /** ISO 8601; null or missing: a draft. */
  @IsOptional()
  @IsISO8601({ strict: true })
  publishedAt?: string | null;
}

export class UpdatePageDto extends PartialType(CreatePageDto, {
  skipNullProperties: false,
}) {}

/* ---------- Page sections ---------- */

/** What a section's ids point at, for showing names next to them. */
export class SectionReferenceDto {
  id: string;
  /** A title or name, or the image's file name. */
  label: string;
  /** Images only: a small version's URL. */
  thumbnailUrl?: string;
}

export class SectionReferencesDto {
  media: SectionReferenceDto[];
  products: SectionReferenceDto[];
  productCategories: SectionReferenceDto[];
  blogCategories: SectionReferenceDto[];
}

export class AdminPageSectionDto {
  id: string;
  pageId: string;
  type: SectionType;
  /** The type's fields (content/entities/section-data.ts). */
  data: Record<string, unknown>;
  position: number;
  /** One record only (not in lists): the names behind the ids in `data`. */
  references?: SectionReferencesDto;
}

export class AdminPageSectionsQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsIn(['id', 'position', 'type'])
  sort: string = 'position';

  @IsOptional()
  @IsUUID()
  pageId?: string;
}

export class CreatePageSectionDto {
  @IsUUID()
  pageId: string;

  @IsEnum(SectionType)
  type: SectionType;

  /** Checked against the type (validateSectionData); HTML fields cleaned. */
  @IsObject()
  data: Record<string, unknown>;
}

/** Only the data changes: a section never changes type or page. */
export class UpdatePageSectionDto {
  @IsObject()
  data: Record<string, unknown>;
}
