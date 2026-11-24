import { BlogCategory } from '@/blog/entities/blog-category.entity';
import { ProductCategory } from '@/catalog/entities/product-category.entity';
import { Product } from '@/catalog/entities/product.entity';
import { Page } from '../entities/page.entity';
import { PageSection, SectionType } from '../entities/page-section.entity';
import type { SectionData } from '../entities/section-data';
import { Media } from '@/media/entities/media.entity';
import {
  collectSectionReferences,
  type SectionLookups,
  toPageDto,
  toPageSectionDto,
} from './page.mappers';

const media = (id: string) =>
  Object.assign(new Media(), {
    id,
    url: `/uploads/${id}.jpg`,
    mime: 'image/jpeg',
    size: 1000,
    width: 800,
    height: 600,
    alt: `Image ${id}`,
    folder: null,
    formats: null,
  });

const product = (id: string, overrides: Partial<Product> = {}) =>
  Object.assign(new Product(), {
    id,
    slug: id,
    title: `Product ${id}`,
    description: null,
    price: 10000,
    weight: null,
    calories: null,
    available: true,
    featured: false,
    favorite: false,
    image: null,
    categories: [] as ProductCategory[],
    ...overrides,
  });

const blogCategory = Object.assign(new BlogCategory(), {
  id: 'news',
  name: 'News',
  slug: 'news',
});

let sequence = 0;
function section(
  type: SectionType,
  data: object,
  position = 0,
  id = `section-${String(++sequence).padStart(3, '0')}`,
): PageSection {
  return Object.assign(new PageSection(), {
    id,
    type,
    data: data as SectionData,
    position,
  });
}

function lookups(overrides: Partial<SectionLookups> = {}): SectionLookups {
  return {
    media: new Map(['img-1', 'img-2', 'icon-1'].map((id) => [id, media(id)])),
    products: new Map(),
    productsByCategory: new Map(),
    featured: [],
    favorite: [],
    blogCategories: new Map([['news', blogCategory]]),
    ...overrides,
  };
}

const mediaDto = (id: string) => ({
  id,
  url: `/uploads/${id}.jpg`,
  alt: `Image ${id}`,
  width: 800,
  height: 600,
  formats: null,
});
const button = { text: 'Go', url: '/go' };

describe('collectSectionReferences', () => {
  it('collects the ids of every section, without duplicates', () => {
    const refs = collectSectionReferences([
      section(SectionType.ImageBanner, { imageId: 'img-1' }),
      section(SectionType.ImageGallery, { imageIds: ['img-1', 'img-2'] }),
      section(SectionType.Benefits, {
        items: [{ iconId: 'icon-1' }, { title: 'no icon' }],
      }),
      section(SectionType.Promo, { iconId: 'icon-2', imageId: 'img-3' }),
      section(SectionType.Video, { placeholderImageId: 'img-4' }),
      section(SectionType.Content, { imageId: 'img-5' }),
      section(SectionType.Articles, { items: [{ iconId: 'icon-3' }] }),
      section(SectionType.Products, {
        source: 'selected',
        productIds: ['p1', 'p2'],
      }),
      section(SectionType.Products, { source: 'category', categoryId: 'c1' }),
      section(SectionType.Products, { source: 'featured' }),
      section(SectionType.News, { blogCategoryId: 'news' }),
      section(SectionType.Contact, { title: 'refers to nothing' }),
    ]);

    expect(refs).toEqual({
      mediaIds: new Set([
        'img-1',
        'img-2',
        'icon-1',
        'icon-2',
        'img-3',
        'img-4',
        'img-5',
        'icon-3',
      ]),
      productIds: new Set(['p1', 'p2']),
      productCategoryIds: new Set(['c1']),
      blogCategoryIds: new Set(['news']),
      featured: true,
      favorite: false,
    });
  });

  it('collects nothing from sections without references', () => {
    const refs = collectSectionReferences([
      section(SectionType.News, {}),
      section(SectionType.Contact, {}),
    ]);

    expect(refs.mediaIds.size + refs.blogCategoryIds.size).toBe(0);
    expect(refs.featured || refs.favorite).toBe(false);
  });

  it('marks favorite products as needed', () => {
    expect(
      collectSectionReferences([
        section(SectionType.Products, { source: 'favorite' }),
      ]).favorite,
    ).toBe(true);
  });
});

describe('toPageSectionDto', () => {
  it.each<[SectionType, object, object]>([
    [
      SectionType.ImageBanner,
      {
        title: 'Hi',
        text: 'Text',
        button,
        imageId: 'img-1',
        backgroundColor: '#000000',
      },
      {
        title: 'Hi',
        text: 'Text',
        button,
        image: mediaDto('img-1'),
        backgroundColor: '#000000',
      },
    ],
    [
      SectionType.ImageBanner,
      {},
      {
        title: null,
        text: null,
        button: null,
        image: null,
        backgroundColor: null,
      },
    ],
    [
      SectionType.Benefits,
      { button, items: [{ title: 'Fast', text: 'Yes', iconId: 'icon-1' }, {}] },
      {
        title: null,
        button,
        items: [
          { title: 'Fast', text: 'Yes', icon: mediaDto('icon-1') },
          { title: null, text: null, icon: null },
        ],
      },
    ],
    [
      SectionType.Articles,
      { anchorId: 'delivery', className: 'wide' },
      {
        title: null,
        button: null,
        items: [],
        anchorId: 'delivery',
        className: 'wide',
      },
    ],
    [
      SectionType.ImageGallery,
      { title: 'Gallery', imageIds: ['img-2', 'img-1'] },
      { title: 'Gallery', images: [mediaDto('img-2'), mediaDto('img-1')] },
    ],
    [SectionType.ImageGallery, {}, { title: null, images: [] }],
    [
      SectionType.Video,
      { description: 'D', videoUrl: 'https://v', placeholderImageId: 'img-1' },
      {
        title: null,
        description: 'D',
        videoUrl: 'https://v',
        placeholderImage: mediaDto('img-1'),
      },
    ],
    [
      SectionType.Video,
      {},
      {
        title: null,
        description: null,
        videoUrl: null,
        placeholderImage: null,
      },
    ],
    [
      SectionType.News,
      { layout: 'list', blogCategoryId: 'news' },
      {
        title: null,
        layout: 'list',
        blogCategory: { id: 'news', name: 'News', slug: 'news' },
      },
    ],
    [
      SectionType.News,
      {},
      { title: null, layout: 'slider', blogCategory: null },
    ],
    [
      SectionType.Content,
      { content: 'C', button, imageId: 'img-1', embedCode: '<iframe>' },
      {
        title: null,
        content: 'C',
        button,
        image: mediaDto('img-1'),
        embedCode: '<iframe>',
      },
    ],
    [
      SectionType.Contact,
      {},
      {
        title: null,
        content: null,
        secondaryContent: null,
        mapEmbedCode: null,
        showForm: false,
        formTitle: null,
      },
    ],
    [
      SectionType.Contact,
      {
        content: 'A',
        secondaryContent: 'B',
        mapEmbedCode: 'M',
        showForm: true,
        formTitle: 'F',
      },
      {
        title: null,
        content: 'A',
        secondaryContent: 'B',
        mapEmbedCode: 'M',
        showForm: true,
        formTitle: 'F',
      },
    ],
    [
      SectionType.Promo,
      {
        text: 'T',
        button,
        iconId: 'icon-1',
        imageId: 'img-1',
        invertLayout: true,
      },
      {
        title: null,
        text: 'T',
        button,
        icon: mediaDto('icon-1'),
        image: mediaDto('img-1'),
        invertLayout: true,
      },
    ],
    [
      SectionType.Promo,
      {},
      {
        title: null,
        text: null,
        button: null,
        icon: null,
        image: null,
        invertLayout: false,
      },
    ],
  ])('maps %s %j', (type, data, expected) => {
    const dto = toPageSectionDto(section(type, data, 0, 's1'), lookups());

    // toEqual on the whole object: no Strapi leftovers, no `undefined` keys.
    expect(dto).toEqual({ id: 's1', type, ...expected });
    expect(Object.values(dto)).not.toContain(undefined);
  });

  it('turns references to deleted rows into null, or leaves them out', () => {
    const empty = lookups({ media: new Map(), blogCategories: new Map() });

    expect(
      toPageSectionDto(section(SectionType.Promo, { imageId: 'gone' }), empty),
    ).toMatchObject({ image: null });
    expect(
      toPageSectionDto(
        section(SectionType.ImageGallery, { imageIds: ['gone', 'img-1'] }),
        lookups(),
      ),
    ).toMatchObject({ images: [mediaDto('img-1')] });
    expect(
      toPageSectionDto(
        section(SectionType.News, { blogCategoryId: 'gone' }),
        empty,
      ),
    ).toMatchObject({ blogCategory: null });
  });

  describe('products', () => {
    const slugs = (dto: object) =>
      (dto as { products: { slug: string }[] }).products.map((p) => p.slug);

    it('keeps the editor order for selected products, dropping unavailable and deleted ones', () => {
      const dto = toPageSectionDto(
        section(SectionType.Products, {
          source: 'selected',
          productIds: ['p3', 'gone', 'p1', 'p2'],
        }),
        lookups({
          products: new Map([
            ['p1', product('p1')],
            ['p2', product('p2', { available: false })],
            ['p3', product('p3')],
          ]),
        }),
      );

      expect(slugs(dto)).toEqual(['p3', 'p1']);
    });

    it.each([
      ['featured', {}, 'featured'],
      ['favorite', {}, 'favorite'],
      ['category', { categoryId: 'c1' }, 'productsByCategory'],
    ] as const)(
      'shows the %s products from the lookups',
      (source, extra, key) => {
        const list = [product('a'), product('b')];
        const loaded = lookups(
          key === 'productsByCategory'
            ? { productsByCategory: new Map([['c1', list]]) }
            : { [key]: list },
        );

        const dto = toPageSectionDto(
          section(SectionType.Products, { source, ...extra }),
          loaded,
        );

        expect(slugs(dto)).toEqual(['a', 'b']);
      },
    );

    it('shows no products for a category that has none (or was deleted)', () => {
      const dto = toPageSectionDto(
        section(SectionType.Products, { source: 'category', categoryId: 'c9' }),
        lookups(),
      );

      expect(slugs(dto)).toEqual([]);
    });

    it('returns the full ProductDto, plus defaults for missing fields', () => {
      const dto = toPageSectionDto(
        section(SectionType.Products, { source: 'featured' }, 0, 's1'),
        lookups({ featured: [product('a')] }),
      );

      expect(dto).toEqual({
        id: 's1',
        type: SectionType.Products,
        title: null,
        source: 'featured',
        layout: 'slider',
        anchorId: null,
        className: null,
        products: [
          {
            id: 'a',
            slug: 'a',
            title: 'Product a',
            description: null,
            price: 10000,
            weight: null,
            calories: null,
            available: true,
            featured: false,
            favorite: false,
            image: null,
            categories: [],
          },
        ],
      });
    });
  });
});

describe('toPageDto', () => {
  const page = (sections: PageSection[]) =>
    Object.assign(new Page(), {
      id: 'page-1',
      slug: 'about-us',
      title: 'About us',
      seo: { title: 'About', description: null },
      publishedAt: new Date(),
      sections,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  it('returns the page fields and its sections', () => {
    const dto = toPageDto(
      page([section(SectionType.Contact, { title: 'Call us' })]),
      lookups(),
    );

    expect(dto).toMatchObject({
      id: 'page-1',
      slug: 'about-us',
      title: 'About us',
      seo: { title: 'About', description: null },
      sections: [{ type: SectionType.Contact, title: 'Call us' }],
    });
    expect(Object.keys(dto).sort()).toEqual([
      'id',
      'sections',
      'seo',
      'slug',
      'title',
    ]);
  });

  it('orders sections by position, then id', () => {
    const dto = toPageDto(
      page([
        section(SectionType.Contact, { title: 'third' }, 2, 'a'),
        section(SectionType.Contact, { title: 'second' }, 1, 'c'),
        section(SectionType.Contact, { title: 'first' }, 1, 'b'),
      ]),
      lookups(),
    );

    expect(dto.sections.map((s) => s.title)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('copes with sections that were not loaded', () => {
    const unloaded = page([]);
    delete (unloaded as Partial<Page>).sections;

    expect(toPageDto(unloaded, lookups()).sections).toEqual([]);
  });
});
