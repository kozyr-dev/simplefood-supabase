import { SectionType } from '@/content/entities/page-section.entity';
import {
  validateSectionData,
  type SectionData,
} from '@/content/entities/section-data';
import type { ComponentRef, StrapiReader } from '../services/strapi-reader';
import { strapiBoolean, textOrNull } from './values';

/** New ids of what the import already wrote, by Strapi row or file id. */
export interface ImportedIds {
  media(fileId: number): string | undefined;
  product(rowId: number): string | undefined;
  productCategory(rowId: number): string | undefined;
  blogCategory(rowId: number): string | undefined;
}

/** Strapi's section components and the section type each becomes. */
export const SECTION_TYPES: Record<string, SectionType> = {
  'sections.image-banner': SectionType.ImageBanner,
  'sections.products': SectionType.Products,
  'sections.benefits': SectionType.Benefits,
  'sections.articles': SectionType.Articles,
  'sections.image-gallery': SectionType.ImageGallery,
  'sections.video-block': SectionType.Video,
  'sections.news-section': SectionType.News,
  'sections.content': SectionType.Content,
  'sections.contact': SectionType.Contact,
  'sections.promo-block': SectionType.Promo,
};

/** Drops the keys whose value is null or undefined: optional fields are left out. */
function compact(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value != null),
  );
}

/**
 * Turns one Strapi section component into our section type and its
 * validated data. Field names change to ours (`custom_ID` → `anchorId`,
 * `Benefit`/`article` → `items`, `content2` → `secondaryContent`, ...);
 * relations and media become the new ids. A link to something that wasn't
 * imported is dropped and reported in `warnings`.
 *
 * @throws InvalidSectionDataError when the result breaks our rules.
 */
export async function mapSection(
  reader: StrapiReader,
  ref: ComponentRef,
  ids: ImportedIds,
  warnings: string[],
): Promise<{ type: SectionType; data: SectionData }> {
  const type = SECTION_TYPES[ref.type];
  if (!type) throw new Error(`Unsupported Strapi section ${ref.type}`);
  const row = reader.component(ref);
  const table = reader.componentTable(ref.type);
  const where = `${ref.type} ${ref.id}`;

  const mediaId = (field: string) => mediaIds(field)[0];
  const mediaIds = (field: string) =>
    reader.media(ref.type, field, ref.id).flatMap((fileId) => {
      const id = ids.media(fileId);
      if (!id)
        warnings.push(`${where}: file ${fileId} (${field}) not imported`);
      return id ? [id] : [];
    });
  const button = () => {
    const found = reader.oneComponent(table, ref.id, 'button');
    const text = textOrNull(found?.text);
    const url = textOrNull(found?.url);
    if (found && (!text || !url)) {
      warnings.push(`${where}: a button without text or link was left out`);
    }
    return text && url ? { text, url } : undefined;
  };
  const items = (field: string, itemType: string) =>
    reader.components(table, ref.id, field).map((item) => {
      const itemRow = reader.component(item);
      return compact({
        title: textOrNull(itemRow.title),
        text: textOrNull(itemRow.text),
        iconId: reader
          .media(itemType, 'icon', item.id)
          .map((fileId) => ids.media(fileId))
          .find(Boolean),
      });
    });
  const title = textOrNull(row.title);

  let data: Record<string, unknown>;
  switch (type) {
    case SectionType.ImageBanner:
      data = {
        title,
        text: textOrNull(row.text),
        button: button(),
        imageId: mediaId('image'),
        backgroundColor: textOrNull(row.background_color),
      };
      break;
    case SectionType.Products: {
      const source = (textOrNull(row.source) ?? '').toLowerCase();
      const categoryRow = reader.links(
        'components_sections_products_product_category_lnk',
        'products_id',
        'product_category_id',
        ref.id,
      )[0];
      const productIds = reader
        .links(
          'components_sections_products_products_lnk',
          'products_id',
          'product_id',
          ref.id,
        )
        .flatMap((rowId) => {
          const id = ids.product(rowId);
          if (!id) warnings.push(`${where}: product row ${rowId} not imported`);
          return id ? [id] : [];
        });
      data = {
        title,
        source,
        categoryId:
          categoryRow === undefined
            ? undefined
            : ids.productCategory(categoryRow),
        // Only `selected` uses the list; an empty one would fail validation.
        productIds: source === 'selected' ? productIds : undefined,
        layout: textOrNull(row.layout)?.toLowerCase(),
        anchorId: textOrNull(row.custom_id),
        className: textOrNull(row.custom_class),
      };
      break;
    }
    case SectionType.Benefits:
      data = { title, button: button(), items: items('Benefit', 'ui.benefit') };
      break;
    case SectionType.Articles:
      data = {
        title,
        button: button(),
        items: items('article', 'ui.article'),
        anchorId: textOrNull(row.custom_id),
        className: textOrNull(row.custom_class),
      };
      break;
    case SectionType.ImageGallery:
      data = { title, imageIds: mediaIds('images') };
      break;
    case SectionType.Video:
      data = {
        title,
        description: textOrNull(row.description),
        videoUrl: textOrNull(row.embed_video_url),
        placeholderImageId: mediaId('placeholder_image'),
      };
      break;
    case SectionType.News: {
      const categoryRow = reader.links(
        'components_sections_news_sections_blog_category_lnk',
        'news_section_id',
        'blog_category_id',
        ref.id,
      )[0];
      data = {
        title,
        layout: textOrNull(row.layout)?.toLowerCase(),
        blogCategoryId:
          categoryRow === undefined ? undefined : ids.blogCategory(categoryRow),
      };
      break;
    }
    case SectionType.Content:
      data = {
        title,
        content: textOrNull(row.content),
        button: button(),
        imageId: mediaId('image'),
        embedCode: textOrNull(row.embed_code),
      };
      break;
    case SectionType.Contact:
      data = {
        title,
        content: textOrNull(row.content),
        secondaryContent: textOrNull(row.content_2),
        mapEmbedCode: textOrNull(row.map_embed_code),
        showForm: strapiBoolean(row.form),
        formTitle: textOrNull(row.form_title),
      };
      break;
    case SectionType.Promo:
      data = {
        title,
        text: textOrNull(row.text),
        button: button(),
        iconId: mediaId('icon'),
        imageId: mediaId('image'),
        invertLayout: strapiBoolean(row.invert_layout),
      };
      break;
  }

  return { type, data: await validateSectionData(type, compact(data)) };
}
