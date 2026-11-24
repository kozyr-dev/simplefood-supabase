import { ApiProperty } from '@nestjs/swagger';
import { BlogCategoryDto } from '@/blog/dto/blog-category.dto';
import { ProductDto } from '@/catalog/dto/product.dto';
import { SectionType } from '../entities/page-section.entity';
import {
  NewsLayout,
  ProductsLayout,
  ProductsSource,
} from '../entities/section-data';
import { MediaDto } from '@/media/dto/media.dto';

/*
 * Page sections as the API returns them: the stored ids (imageId,
 * productIds, ...) replaced by the objects they point to, and every field
 * present (null when empty), so clients never have to check for `undefined`.
 *
 * Each class pins `type` to its one value with an explicit decorator: the
 * CLI plugin would document it as the whole enum, and the discriminator in
 * PageDto needs the single value.
 */

export class ButtonDto {
  /** @example "See the menu" */
  text: string;

  /** Usually a relative path. @example "/simple-menu" */
  url: string;
}

/** An entry of a benefits or articles list. */
export class SectionItemDto {
  title: string | null;

  /** Markdown. */
  text: string | null;

  @ApiProperty({ type: MediaDto, nullable: true })
  icon: MediaDto | null;
}

/** Fields every section has. */
abstract class SectionDtoBase {
  /** Stable key for rendering lists. */
  id: string;

  /** Section heading; null when the section has none. */
  title: string | null;
}

export class ImageBannerSectionDto extends SectionDtoBase {
  @ApiProperty({ enum: [SectionType.ImageBanner] })
  type: SectionType.ImageBanner;

  /** HTML, sanitized when saved (`common/html/sanitize.ts`). */
  text: string | null;

  @ApiProperty({ type: ButtonDto, nullable: true })
  button: ButtonDto | null;

  @ApiProperty({ type: MediaDto, nullable: true })
  image: MediaDto | null;

  /** `#RRGGBB`; null for the default. @example "#0D0B0C" */
  backgroundColor: string | null;
}

export class ProductsSectionDto extends SectionDtoBase {
  @ApiProperty({ enum: [SectionType.Products] })
  type: SectionType.Products;

  /** How `products` were picked (already applied; for display only). */
  @ApiProperty({ enum: ProductsSource, enumName: 'ProductsSource' })
  source: ProductsSource;

  @ApiProperty({ enum: ProductsLayout, enumName: 'ProductsLayout' })
  layout: ProductsLayout;

  /**
   * Available products only. `selected` keeps the editor's order; the
   * other sources are ordered by title.
   */
  products: ProductDto[];

  /** HTML id for in-page links (`/simple-menu#soup`). */
  anchorId: string | null;

  /** Extra CSS class names for the section. */
  className: string | null;
}

export class BenefitsSectionDto extends SectionDtoBase {
  @ApiProperty({ enum: [SectionType.Benefits] })
  type: SectionType.Benefits;

  @ApiProperty({ type: ButtonDto, nullable: true })
  button: ButtonDto | null;

  items: SectionItemDto[];
}

export class ArticlesSectionDto extends SectionDtoBase {
  @ApiProperty({ enum: [SectionType.Articles] })
  type: SectionType.Articles;

  @ApiProperty({ type: ButtonDto, nullable: true })
  button: ButtonDto | null;

  items: SectionItemDto[];

  /** HTML id for in-page links. */
  anchorId: string | null;

  /** Extra CSS class names for the section. */
  className: string | null;
}

export class ImageGallerySectionDto extends SectionDtoBase {
  @ApiProperty({ enum: [SectionType.ImageGallery] })
  type: SectionType.ImageGallery;

  /** In the editor's order. */
  images: MediaDto[];
}

export class VideoSectionDto extends SectionDtoBase {
  @ApiProperty({ enum: [SectionType.Video] })
  type: SectionType.Video;

  /** HTML, sanitized when saved (`common/html/sanitize.ts`). */
  description: string | null;

  /** Embeddable player URL. @example "https://www.youtube.com/embed/sTDscPFvehQ" */
  videoUrl: string | null;

  @ApiProperty({
    type: MediaDto,
    nullable: true,
    description: 'Shown until the video is played.',
  })
  placeholderImage: MediaDto | null;
}

export class NewsSectionDto extends SectionDtoBase {
  @ApiProperty({ enum: [SectionType.News] })
  type: SectionType.News;

  @ApiProperty({ enum: NewsLayout, enumName: 'NewsLayout' })
  layout: NewsLayout;

  // Only the category: the posts are paginated, so the client loads them
  // with `GET /api/blog-posts?category=<slug>&page=N`.
  @ApiProperty({
    type: BlogCategoryDto,
    nullable: true,
    description:
      'Load its posts with `GET /api/blog-posts?category=<slug>`; null = all posts.',
  })
  blogCategory: BlogCategoryDto | null;
}

export class ContentSectionDto extends SectionDtoBase {
  @ApiProperty({ enum: [SectionType.Content] })
  type: SectionType.Content;

  /** HTML, sanitized when saved (`common/html/sanitize.ts`). */
  content: string | null;

  @ApiProperty({ type: ButtonDto, nullable: true })
  button: ButtonDto | null;

  @ApiProperty({ type: MediaDto, nullable: true })
  image: MediaDto | null;

  /** One `<iframe>` from an allowed host (EMBED_HOSTS: maps, YouTube, Vimeo); sanitized when saved. */
  embedCode: string | null;
}

export class ContactSectionDto extends SectionDtoBase {
  @ApiProperty({ enum: [SectionType.Contact] })
  type: SectionType.Contact;

  /** HTML, sanitized when saved (`common/html/sanitize.ts`). */
  content: string | null;

  /** HTML, shown in a second column; sanitized when saved. */
  secondaryContent: string | null;

  /** The map: one `<iframe>` from an allowed host (EMBED_HOSTS); sanitized when saved. */
  mapEmbedCode: string | null;

  /** Show the contact form (`POST /api/contact`). */
  showForm: boolean;

  formTitle: string | null;
}

export class PromoSectionDto extends SectionDtoBase {
  @ApiProperty({ enum: [SectionType.Promo] })
  type: SectionType.Promo;

  /** Markdown. */
  text: string | null;

  @ApiProperty({ type: ButtonDto, nullable: true })
  button: ButtonDto | null;

  @ApiProperty({ type: MediaDto, nullable: true })
  icon: MediaDto | null;

  @ApiProperty({ type: MediaDto, nullable: true })
  image: MediaDto | null;

  /** Image on the left instead of the right. */
  invertLayout: boolean;
}

/** The response class of each section type. A new SectionType must be added here. */
export const SECTION_DTOS = {
  [SectionType.ImageBanner]: ImageBannerSectionDto,
  [SectionType.Products]: ProductsSectionDto,
  [SectionType.Benefits]: BenefitsSectionDto,
  [SectionType.Articles]: ArticlesSectionDto,
  [SectionType.ImageGallery]: ImageGallerySectionDto,
  [SectionType.Video]: VideoSectionDto,
  [SectionType.News]: NewsSectionDto,
  [SectionType.Content]: ContentSectionDto,
  [SectionType.Contact]: ContactSectionDto,
  [SectionType.Promo]: PromoSectionDto,
} satisfies Record<SectionType, new () => SectionDtoBase>;

/** The response shape of one section type. */
export type SectionDtoOf<T extends SectionType> = InstanceType<
  (typeof SECTION_DTOS)[T]
>;

/** Any section; narrow it with `switch (section.type)`. */
export type PageSectionDto = SectionDtoOf<SectionType>;
