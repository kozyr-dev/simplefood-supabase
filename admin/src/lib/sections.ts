/*
 * The page section types, as the admin forms edit them. The API checks the
 * data (validateSectionData) and cleans the HTML; these helpers only keep
 * the forms tidy: each type's own fields, nothing empty.
 */

export const SECTION_TYPES = [
  'image-banner',
  'products',
  'benefits',
  'articles',
  'image-gallery',
  'video',
  'news',
  'content',
  'contact',
  'promo',
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

export const SECTION_LABELS: Record<SectionType, string> = {
  'image-banner': 'Image banner',
  products: 'Products',
  benefits: 'Benefits',
  articles: 'Articles',
  'image-gallery': 'Image gallery',
  video: 'Video',
  news: 'News',
  content: 'Content',
  contact: 'Contact',
  promo: 'Promo',
};

const BUTTON = 'button';
const ITEMS = 'items';

/** The top-level fields each type has (content/entities/section-data.ts). */
export const SECTION_FIELDS: Record<SectionType, readonly string[]> = {
  'image-banner': ['title', 'text', BUTTON, 'imageId', 'backgroundColor'],
  products: [
    'title',
    'source',
    'categoryId',
    'productIds',
    'layout',
    'anchorId',
    'className',
  ],
  benefits: ['title', BUTTON, ITEMS],
  articles: ['title', BUTTON, ITEMS, 'anchorId', 'className'],
  'image-gallery': ['title', 'imageIds'],
  video: ['title', 'description', 'videoUrl', 'placeholderImageId'],
  news: ['title', 'layout', 'blogCategoryId'],
  content: ['title', 'content', BUTTON, 'imageId', 'embedCode'],
  contact: [
    'title',
    'content',
    'secondaryContent',
    'mapEmbedCode',
    'showForm',
    'formTitle',
  ],
  promo: ['title', 'text', BUTTON, 'iconId', 'imageId', 'invertLayout'],
};

/** What a new section of the type starts with. */
export function emptySectionData(type: SectionType): Record<string, unknown> {
  return type === 'products' ? { source: 'featured' } : {};
}

/** Drops null, blank strings and empty objects, recursively. */
export function compact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compact);
  if (value === null || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const clean = compact(item);
    if (clean === null || clean === undefined) continue;
    if (typeof clean === 'string' && !clean.trim()) continue;
    if (
      typeof clean === 'object' &&
      !Array.isArray(clean) &&
      !Object.keys(clean).length
    ) {
      continue;
    }
    result[key] = clean;
  }
  return result;
}

/**
 * The data to save: the type's fields only (a form keeps values of fields
 * it no longer shows), and nothing empty. `products` keeps only the field
 * its source uses.
 */
export function sectionDataToSave(
  type: SectionType,
  data: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const fields = new Set(SECTION_FIELDS[type]);
  if (type === 'products') {
    if (data?.source !== 'category') fields.delete('categoryId');
    if (data?.source !== 'selected') fields.delete('productIds');
  }
  const own = Object.fromEntries(
    Object.entries(data ?? {}).filter(([key]) => fields.has(key)),
  );
  return compact(own) as Record<string, unknown>;
}
