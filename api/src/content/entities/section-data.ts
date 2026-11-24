import { plainToInstance, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  validate,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  flattenValidationErrors,
  type ValidationErrorDetail,
} from '@/common/validation/flatten-validation-errors';
import { SectionType } from './page-section.entity';

/*
 * What `page_section.data` holds, per section type. These classes are the
 * write-side contract: the Strapi data migration, the admin and the test
 * factories all run validateSectionData() before saving. Text fields marked
 * "markdown" are rendered as markdown by the frontend.
 *
 * Everything optional may be missing from the stored JSON; the API fills in
 * `null` (or the default) when it builds the response.
 */

/** Which products a products section shows. */
export enum ProductsSource {
  Featured = 'featured',
  Favorite = 'favorite',
  Category = 'category',
  Selected = 'selected',
}

export enum ProductsLayout {
  Slider = 'slider',
  Grid = 'grid',
}

export enum NewsLayout {
  Slider = 'slider',
  List = 'list',
}

/** A valid HTML id, used as an in-page anchor (`/simple-menu#soup`). */
const ANCHOR_ID = /^[A-Za-z][\w-]*$/;
/** One or more space-separated CSS class names. */
const CLASS_NAMES = /^[\w-]+(?: [\w-]+)*$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export class ButtonData {
  @IsString()
  @MaxLength(100)
  text: string;

  /** Not validated as a URL: links are usually relative (`/simple-menu`). */
  @IsString()
  @MaxLength(500)
  url: string;
}

/** An entry of a benefits or articles list. */
export class SectionItemData {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  /** Markdown. */
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsUUID()
  iconId?: string;
}

/** Every section type has an optional heading. */
abstract class TitledSectionData {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;
}

export class ImageBannerSectionData extends TitledSectionData {
  /** Markdown. */
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ButtonData)
  button?: ButtonData;

  @IsOptional()
  @IsUUID()
  imageId?: string;

  /** `#RRGGBB`. */
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'backgroundColor must be a #RRGGBB color' })
  backgroundColor?: string;
}

export class ProductsSectionData extends TitledSectionData {
  @IsEnum(ProductsSource)
  source: ProductsSource;

  /** Required for `source: category`, ignored otherwise. */
  @ValidateIf(
    (data: ProductsSectionData) => data.source === ProductsSource.Category,
  )
  @IsUUID()
  categoryId?: string;

  /** Required for `source: selected` (shown in this order), ignored otherwise. */
  @ValidateIf(
    (data: ProductsSectionData) => data.source === ProductsSource.Selected,
  )
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  productIds?: string[];

  /** Defaults to `slider`. */
  @IsOptional()
  @IsEnum(ProductsLayout)
  layout?: ProductsLayout;

  @IsOptional()
  @Matches(ANCHOR_ID, { message: 'anchorId must be a valid HTML id' })
  @MaxLength(100)
  anchorId?: string;

  @IsOptional()
  @Matches(CLASS_NAMES, { message: 'className must be CSS class names' })
  @MaxLength(100)
  className?: string;
}

export class BenefitsSectionData extends TitledSectionData {
  @IsOptional()
  @ValidateNested()
  @Type(() => ButtonData)
  button?: ButtonData;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionItemData)
  items?: SectionItemData[];
}

export class ArticlesSectionData extends BenefitsSectionData {
  @IsOptional()
  @Matches(ANCHOR_ID, { message: 'anchorId must be a valid HTML id' })
  @MaxLength(100)
  anchorId?: string;

  @IsOptional()
  @Matches(CLASS_NAMES, { message: 'className must be CSS class names' })
  @MaxLength(100)
  className?: string;
}

export class ImageGallerySectionData extends TitledSectionData {
  /** Shown in this order. */
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  imageIds?: string[];
}

export class VideoSectionData extends TitledSectionData {
  /** Markdown. */
  @IsOptional()
  @IsString()
  description?: string;

  /** An embeddable player URL, e.g. `https://www.youtube.com/embed/<id>`. */
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  videoUrl?: string;

  /** Shown until the video is played. */
  @IsOptional()
  @IsUUID()
  placeholderImageId?: string;
}

export class NewsSectionData extends TitledSectionData {
  /** Defaults to `slider`. */
  @IsOptional()
  @IsEnum(NewsLayout)
  layout?: NewsLayout;

  /** Only this category's posts; all posts when missing. */
  @IsOptional()
  @IsUUID()
  blogCategoryId?: string;
}

// Embed codes are raw HTML (an <iframe>) that the frontend puts on the page
// as-is. That's only acceptable because just admins and editors can write
// sections; never accept them from public input.

export class ContentSectionData extends TitledSectionData {
  /** Markdown. */
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ButtonData)
  button?: ButtonData;

  @IsOptional()
  @IsUUID()
  imageId?: string;

  /** Trusted HTML, e.g. an <iframe>. */
  @IsOptional()
  @IsString()
  embedCode?: string;
}

export class ContactSectionData extends TitledSectionData {
  /** Markdown. */
  @IsOptional()
  @IsString()
  content?: string;

  /** Markdown, shown in a second column. */
  @IsOptional()
  @IsString()
  secondaryContent?: string;

  /** Trusted HTML: the map <iframe>. */
  @IsOptional()
  @IsString()
  mapEmbedCode?: string;

  /** Show the contact form; defaults to false. */
  @IsOptional()
  @IsBoolean()
  showForm?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  formTitle?: string;
}

export class PromoSectionData extends TitledSectionData {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ButtonData)
  button?: ButtonData;

  @IsOptional()
  @IsUUID()
  iconId?: string;

  @IsOptional()
  @IsUUID()
  imageId?: string;

  /** Image on the left instead of the right; defaults to false. */
  @IsOptional()
  @IsBoolean()
  invertLayout?: boolean;
}

/** The data class of each section type. A new SectionType must be added here. */
export const SECTION_DATA_CLASSES = {
  [SectionType.ImageBanner]: ImageBannerSectionData,
  [SectionType.Products]: ProductsSectionData,
  [SectionType.Benefits]: BenefitsSectionData,
  [SectionType.Articles]: ArticlesSectionData,
  [SectionType.ImageGallery]: ImageGallerySectionData,
  [SectionType.Video]: VideoSectionData,
  [SectionType.News]: NewsSectionData,
  [SectionType.Content]: ContentSectionData,
  [SectionType.Contact]: ContactSectionData,
  [SectionType.Promo]: PromoSectionData,
} satisfies Record<SectionType, new () => object>;

/** The `data` shape of one section type, e.g. `SectionDataOf<SectionType.Video>`. */
export type SectionDataOf<T extends SectionType> = InstanceType<
  (typeof SECTION_DATA_CLASSES)[T]
>;

export type SectionData = SectionDataOf<SectionType>;

export class InvalidSectionDataError extends Error {
  constructor(
    readonly type: SectionType,
    readonly details: ValidationErrorDetail[],
  ) {
    const summary = details
      .map(({ field, messages }) => `${field}: ${messages.join(', ')}`)
      .join('; ');
    super(`Invalid "${type}" section data: ${summary}`);
    this.name = 'InvalidSectionDataError';
  }
}

/**
 * Checks `data` against its type's class and returns it as an instance of
 * that class. Unknown keys are rejected, not dropped: a typo in a migration
 * or the admin should fail loudly instead of silently losing content.
 * @throws InvalidSectionDataError
 */
export async function validateSectionData<T extends SectionType>(
  type: T,
  data: unknown,
): Promise<SectionDataOf<T>> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new InvalidSectionDataError(type, [
      { field: 'data', messages: ['data must be an object'] },
    ]);
  }

  const instance = plainToInstance(SECTION_DATA_CLASSES[type], data);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0) {
    throw new InvalidSectionDataError(
      type,
      flattenValidationErrors(errors).details,
    );
  }
  return instance as SectionDataOf<T>;
}
