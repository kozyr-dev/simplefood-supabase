import type { BlogCategory } from '@/blog/entities/blog-category.entity';
import { toBlogCategoryDto } from '@/blog/mappers/blog.mappers';
import type { ProductDto } from '@/catalog/dto/product.dto';
import type { Product } from '@/catalog/entities/product.entity';
import { toProductDto } from '@/catalog/mappers/catalog.mappers';
import { toSeoDto } from '@/common/seo/seo.mapper';
import type {
  ButtonDto,
  PageSectionDto,
  SectionDtoOf,
  SectionItemDto,
} from '../dto/page-sections.dto';
import type { PageDto } from '../dto/page.dto';
import type { Page } from '../entities/page.entity';
import { SectionType, type PageSection } from '../entities/page-section.entity';
import {
  NewsLayout,
  ProductsLayout,
  ProductsSource,
  type ButtonData,
  type SectionDataOf,
  type SectionItemData,
} from '../entities/section-data';
import type { MediaDto } from '@/media/dto/media.dto';
import type { Media } from '@/media/entities/media.entity';
import { toMediaDto, toMediaDtoOrNull } from '@/media/mappers/media.mapper';

/*
 * Turning stored sections into API sections happens in three steps, so a
 * page costs the same few queries however many sections it has:
 *   1. collectSectionReferences(): every id any section points to;
 *   2. SectionReferencesService.load(): one query per kind of row;
 *   3. toPageDto(): pure mapping from the loaded rows (this file).
 * A referenced row may be gone (jsonb has no foreign keys): a missing single
 * reference becomes null, a missing list entry is left out.
 */

/** Everything a page's sections refer to. */
export interface SectionReferences {
  mediaIds: Set<string>;
  productIds: Set<string>;
  productCategoryIds: Set<string>;
  blogCategoryIds: Set<string>;
  /** Some products section shows the featured products. */
  featured: boolean;
  /** Some products section shows the favorite products. */
  favorite: boolean;
}

/** The referenced rows, loaded. Product lists hold available products only. */
export interface SectionLookups {
  media: Map<string, Media>;
  /** By id, available or not (`selected` sections filter them). */
  products: Map<string, Product>;
  /** Available products of each requested category, ordered by title. */
  productsByCategory: Map<string, Product[]>;
  /** Available featured products, ordered by title. */
  featured: Product[];
  /** Available favorite products, ordered by title. */
  favorite: Product[];
  blogCategories: Map<string, BlogCategory>;
}

export function emptySectionReferences(): SectionReferences {
  return {
    mediaIds: new Set(),
    productIds: new Set(),
    productCategoryIds: new Set(),
    blogCategoryIds: new Set(),
    featured: false,
    favorite: false,
  };
}

/** How one section type is resolved. */
interface SectionMapper<T extends SectionType> {
  /** Adds the ids this section's data refers to. */
  collect(data: SectionDataOf<T>, refs: SectionReferences): void;
  /** Stored data + loaded rows -> the type's fields (without `id`/`type`). */
  toDto(
    data: SectionDataOf<T>,
    lookups: SectionLookups,
  ): Omit<SectionDtoOf<T>, 'id' | 'type' | 'title'>;
}

function addIds(target: Set<string>, ...ids: (string | undefined)[]) {
  for (const id of ids) {
    if (id) target.add(id);
  }
}

function mediaOrNull(
  id: string | undefined,
  { media }: SectionLookups,
): MediaDto | null {
  return toMediaDtoOrNull(id ? media.get(id) : null);
}

function mediaList(
  ids: string[] | undefined,
  { media }: SectionLookups,
): MediaDto[] {
  return (ids ?? []).flatMap((id) => {
    const found = media.get(id);
    return found ? [toMediaDto(found)] : [];
  });
}

function toButtonDto(button: ButtonData | undefined): ButtonDto | null {
  return button ? { text: button.text, url: button.url } : null;
}

function toItemDtos(
  items: SectionItemData[] | undefined,
  lookups: SectionLookups,
): SectionItemDto[] {
  return (items ?? []).map((item) => ({
    title: item.title ?? null,
    text: item.text ?? null,
    icon: mediaOrNull(item.iconId, lookups),
  }));
}

/** Drops missing and unavailable products, keeping the given order. */
function availableProducts(products: (Product | undefined)[]): ProductDto[] {
  return products
    .filter((product): product is Product => product?.available === true)
    .map(toProductDto);
}

function pickProducts(
  data: SectionDataOf<SectionType.Products>,
  lookups: SectionLookups,
): (Product | undefined)[] {
  switch (data.source) {
    case ProductsSource.Featured:
      return lookups.featured;
    case ProductsSource.Favorite:
      return lookups.favorite;
    case ProductsSource.Category:
      return data.categoryId
        ? (lookups.productsByCategory.get(data.categoryId) ?? [])
        : [];
    case ProductsSource.Selected:
      return (data.productIds ?? []).map((id) => lookups.products.get(id));
  }
}

// A mapped type: leaving out a SectionType is a compile error.
const SECTION_MAPPERS: { [T in SectionType]: SectionMapper<T> } = {
  [SectionType.ImageBanner]: {
    collect: (data, refs) => addIds(refs.mediaIds, data.imageId),
    toDto: (data, lookups) => ({
      text: data.text ?? null,
      button: toButtonDto(data.button),
      image: mediaOrNull(data.imageId, lookups),
      backgroundColor: data.backgroundColor ?? null,
    }),
  },
  [SectionType.Products]: {
    collect: (data, refs) => {
      switch (data.source) {
        case ProductsSource.Featured:
          refs.featured = true;
          break;
        case ProductsSource.Favorite:
          refs.favorite = true;
          break;
        case ProductsSource.Category:
          addIds(refs.productCategoryIds, data.categoryId);
          break;
        case ProductsSource.Selected:
          addIds(refs.productIds, ...(data.productIds ?? []));
          break;
      }
    },
    toDto: (data, lookups) => ({
      source: data.source,
      layout: data.layout ?? ProductsLayout.Slider,
      products: availableProducts(pickProducts(data, lookups)),
      anchorId: data.anchorId ?? null,
      className: data.className ?? null,
    }),
  },
  [SectionType.Benefits]: {
    collect: (data, refs) =>
      addIds(refs.mediaIds, ...(data.items ?? []).map((item) => item.iconId)),
    toDto: (data, lookups) => ({
      button: toButtonDto(data.button),
      items: toItemDtos(data.items, lookups),
    }),
  },
  [SectionType.Articles]: {
    collect: (data, refs) =>
      addIds(refs.mediaIds, ...(data.items ?? []).map((item) => item.iconId)),
    toDto: (data, lookups) => ({
      button: toButtonDto(data.button),
      items: toItemDtos(data.items, lookups),
      anchorId: data.anchorId ?? null,
      className: data.className ?? null,
    }),
  },
  [SectionType.ImageGallery]: {
    collect: (data, refs) => addIds(refs.mediaIds, ...(data.imageIds ?? [])),
    toDto: (data, lookups) => ({
      images: mediaList(data.imageIds, lookups),
    }),
  },
  [SectionType.Video]: {
    collect: (data, refs) => addIds(refs.mediaIds, data.placeholderImageId),
    toDto: (data, lookups) => ({
      description: data.description ?? null,
      videoUrl: data.videoUrl ?? null,
      placeholderImage: mediaOrNull(data.placeholderImageId, lookups),
    }),
  },
  [SectionType.News]: {
    collect: (data, refs) => addIds(refs.blogCategoryIds, data.blogCategoryId),
    toDto: (data, lookups) => {
      const category = data.blogCategoryId
        ? lookups.blogCategories.get(data.blogCategoryId)
        : undefined;
      return {
        layout: data.layout ?? NewsLayout.Slider,
        blogCategory: category ? toBlogCategoryDto(category) : null,
      };
    },
  },
  [SectionType.Content]: {
    collect: (data, refs) => addIds(refs.mediaIds, data.imageId),
    toDto: (data, lookups) => ({
      content: data.content ?? null,
      button: toButtonDto(data.button),
      image: mediaOrNull(data.imageId, lookups),
      embedCode: data.embedCode ?? null,
    }),
  },
  [SectionType.Contact]: {
    collect: () => {},
    toDto: (data) => ({
      content: data.content ?? null,
      secondaryContent: data.secondaryContent ?? null,
      mapEmbedCode: data.mapEmbedCode ?? null,
      showForm: data.showForm ?? false,
      formTitle: data.formTitle ?? null,
    }),
  },
  [SectionType.Promo]: {
    collect: (data, refs) => addIds(refs.mediaIds, data.iconId, data.imageId),
    toDto: (data, lookups) => ({
      text: data.text ?? null,
      button: toButtonDto(data.button),
      icon: mediaOrNull(data.iconId, lookups),
      image: mediaOrNull(data.imageId, lookups),
      invertLayout: data.invertLayout ?? false,
    }),
  },
};

// `section.type` and `section.data` are separate columns, so TypeScript can't
// see that they match; validateSectionData() guarantees it on every write.
// This is the one place that relies on it.
function mapperFor(section: PageSection): SectionMapper<SectionType> {
  return SECTION_MAPPERS[section.type] as SectionMapper<SectionType>;
}

export function collectSectionReferences(
  sections: PageSection[],
): SectionReferences {
  const refs = emptySectionReferences();
  for (const section of sections) {
    mapperFor(section).collect(section.data, refs);
  }
  return refs;
}

export function toPageSectionDto(
  section: PageSection,
  lookups: SectionLookups,
): PageSectionDto {
  return {
    id: section.id,
    type: section.type,
    title: section.data.title ?? null,
    ...mapperFor(section).toDto(section.data, lookups),
  } as PageSectionDto;
}

/** Display order of sections: `position`, then id (creation order). */
export function compareSections(a: PageSection, b: PageSection): number {
  return a.position - b.position || a.id.localeCompare(b.id);
}

/** Expects `sections` to be loaded. */
export function toPageDto(page: Page, lookups: SectionLookups): PageDto {
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    seo: toSeoDto(page.seo),
    sections: [...(page.sections ?? [])]
      .sort(compareSections)
      .map((section) => toPageSectionDto(section, lookups)),
  };
}
