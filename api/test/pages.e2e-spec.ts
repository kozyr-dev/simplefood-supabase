import { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import { Product } from '@/catalog/entities/product.entity';
import {
  buildSwaggerDocumentConfig,
  operationIdFactory,
} from '@/config/swagger.config';
import {
  PageSection,
  SectionType,
} from '@/content/entities/page-section.entity';
import { HOME_PAGE_SLUG, Page } from '@/content/entities/page.entity';
import { Media } from '@/media/entities/media.entity';
import { resetDatabase } from './utils/database';
import {
  createBlogCategory,
  createCategory,
  createMedia,
  createPage,
  createProduct,
  daysFromNow,
  type SectionInput,
} from './utils/factories';
import { createTestApp } from './utils/test-app';

interface ProductsSectionBody {
  products: { slug: string }[];
}

describe('Pages (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const getPage = async (slug: string) =>
    (await http().get(`/api/pages/${slug}`).expect(200)).body.data;
  const productSlugs = (section: ProductsSectionBody) =>
    section.products.map((product) => product.slug);

  describe('GET /api/pages/:slug', () => {
    it('resolves every section type: media, products and categories embedded', async () => {
      const image = await createMedia(dataSource, { alt: 'Banner' });
      const icon = await createMedia(dataSource, { alt: 'Icon' });
      const soups = await createCategory(dataSource, { slug: 'soups' });
      const borscht = await createProduct(dataSource, {
        slug: 'borscht',
        title: 'Borscht',
        categories: [soups],
        image,
      });
      const news = await createBlogCategory(dataSource, {
        name: 'News',
        slug: 'news',
      });
      const button = { text: 'See the menu', url: '/simple-menu' };

      await createPage(
        dataSource,
        { slug: 'everything', title: 'Everything' },
        [
          {
            type: SectionType.ImageBanner,
            data: {
              title: 'Hi',
              imageId: image.id,
              button,
              backgroundColor: '#0D0B0C',
            },
          },
          {
            type: SectionType.Products,
            data: {
              title: 'Soups',
              source: 'category',
              categoryId: soups.id,
              layout: 'grid',
              anchorId: 'soup',
            },
          },
          {
            type: SectionType.Benefits,
            data: { items: [{ title: 'Fast', iconId: icon.id }] },
          },
          {
            type: SectionType.Articles,
            data: { items: [{ text: 'Story' }], className: 'dark' },
          },
          {
            type: SectionType.ImageGallery,
            data: { imageIds: [icon.id, image.id] },
          },
          {
            type: SectionType.Video,
            data: {
              videoUrl: 'https://www.youtube.com/embed/sTDscPFvehQ',
              placeholderImageId: image.id,
            },
          },
          {
            type: SectionType.News,
            data: { layout: 'list', blogCategoryId: news.id },
          },
          {
            type: SectionType.Content,
            data: { content: '## About', embedCode: '<iframe></iframe>' },
          },
          {
            type: SectionType.Contact,
            data: { showForm: true, formTitle: 'Write to us' },
          },
          {
            type: SectionType.Promo,
            data: { iconId: icon.id, imageId: image.id, invertLayout: true },
          },
        ],
      );

      const page = await getPage('everything');

      expect(page).toMatchObject({
        slug: 'everything',
        title: 'Everything',
        seo: { title: null, description: null, shareImage: null },
      });
      const media = (m: Media) =>
        expect.objectContaining({ id: m.id, url: m.url, alt: m.alt });
      expect(page.sections).toEqual([
        {
          id: expect.any(String),
          type: 'image-banner',
          title: 'Hi',
          text: null,
          button,
          image: media(image),
          backgroundColor: '#0D0B0C',
        },
        {
          id: expect.any(String),
          type: 'products',
          title: 'Soups',
          source: 'category',
          layout: 'grid',
          products: [
            expect.objectContaining({
              id: borscht.id,
              slug: 'borscht',
              price: 10000,
              image: media(image),
              categories: [{ id: soups.id, name: soups.name, slug: 'soups' }],
            }),
          ],
          anchorId: 'soup',
          className: null,
        },
        {
          id: expect.any(String),
          type: 'benefits',
          title: null,
          button: null,
          items: [{ title: 'Fast', text: null, icon: media(icon) }],
        },
        {
          id: expect.any(String),
          type: 'articles',
          title: null,
          button: null,
          items: [{ title: null, text: 'Story', icon: null }],
          anchorId: null,
          className: 'dark',
        },
        {
          id: expect.any(String),
          type: 'image-gallery',
          title: null,
          images: [media(icon), media(image)],
        },
        {
          id: expect.any(String),
          type: 'video',
          title: null,
          description: null,
          videoUrl: 'https://www.youtube.com/embed/sTDscPFvehQ',
          placeholderImage: media(image),
        },
        {
          id: expect.any(String),
          type: 'news',
          title: null,
          layout: 'list',
          blogCategory: { id: news.id, name: 'News', slug: 'news' },
        },
        {
          id: expect.any(String),
          type: 'content',
          title: null,
          content: '## About',
          button: null,
          image: null,
          embedCode: '<iframe></iframe>',
        },
        {
          id: expect.any(String),
          type: 'contact',
          title: null,
          content: null,
          secondaryContent: null,
          mapEmbedCode: null,
          showForm: true,
          formTitle: 'Write to us',
        },
        {
          id: expect.any(String),
          type: 'promo',
          title: null,
          text: null,
          button: null,
          icon: media(icon),
          image: media(image),
          invertLayout: true,
        },
      ]);
    });

    it('serves the homepage as the page with slug "home"', async () => {
      await createPage(dataSource, { slug: HOME_PAGE_SLUG, title: 'Home' });

      expect(await getPage('home')).toMatchObject({
        slug: 'home',
        title: 'Home',
      });
    });

    it('returns sections by position, not by creation order', async () => {
      await createPage(dataSource, { slug: 'ordered' }, [
        { type: SectionType.Contact, data: { title: 'third' }, position: 3 },
        { type: SectionType.Contact, data: { title: 'first' }, position: 1 },
        { type: SectionType.Contact, data: { title: 'second' }, position: 2 },
      ]);

      const page = await getPage('ordered');

      expect(page.sections.map((s: { title: string }) => s.title)).toEqual([
        'first',
        'second',
        'third',
      ]);
    });

    it('returns the SEO fields with the share image', async () => {
      const shareImage = await createMedia(dataSource);
      await createPage(dataSource, {
        slug: 'shared',
        seo: { title: 'About', description: 'Us', shareImage },
      });

      expect((await getPage('shared')).seo).toEqual({
        title: 'About',
        description: 'Us',
        shareImage: expect.objectContaining({ id: shareImage.id }),
      });
    });

    it.each([
      ['an unknown', 'nope', undefined],
      ['a draft', 'draft', null],
      ['a scheduled', 'scheduled', daysFromNow(1)],
    ])(
      'returns the same 404 for %s page (no hint that it exists)',
      async (_label, slug, publishedAt) => {
        if (publishedAt !== undefined) {
          await createPage(dataSource, { slug, publishedAt });
        }

        const res = await http().get(`/api/pages/${slug}`).expect(404);

        expect(res.body).toEqual({
          error: {
            status: 404,
            code: 'NOT_FOUND',
            message: 'Page not found',
            requestId: expect.any(String),
          },
        });
      },
    );

    it('shows a scheduled page once its publish date has passed', async () => {
      const page = await createPage(dataSource, {
        slug: 'soon',
        publishedAt: daysFromNow(1),
      });
      await http().get('/api/pages/soon').expect(404);

      await dataSource
        .getRepository(Page)
        .update({ id: page.id }, { publishedAt: daysFromNow(-1) });

      await http().get('/api/pages/soon').expect(200);
    });
  });

  describe('products sections', () => {
    const productsPage = (sections: SectionInput[]) =>
      createPage(dataSource, { slug: 'menu' }, sections);

    it('shows only available featured and favorite products, by title', async () => {
      await createProduct(dataSource, {
        slug: 'b-featured',
        title: 'B',
        featured: true,
      });
      await createProduct(dataSource, {
        slug: 'a-featured',
        title: 'A',
        featured: true,
      });
      await createProduct(dataSource, {
        slug: 'sold-out',
        featured: true,
        available: false,
      });
      await createProduct(dataSource, { slug: 'loved', favorite: true });
      await createProduct(dataSource, { slug: 'plain' });
      await productsPage([
        { type: SectionType.Products, data: { source: 'featured' } },
        { type: SectionType.Products, data: { source: 'favorite' } },
      ]);

      const [featured, favorite] = (await getPage('menu')).sections;

      expect(productSlugs(featured)).toEqual(['a-featured', 'b-featured']);
      expect(productSlugs(favorite)).toEqual(['loved']);
    });

    it('shows the available products of a category, with all their categories', async () => {
      const soups = await createCategory(dataSource, {
        slug: 'soups',
        position: 1,
      });
      const hot = await createCategory(dataSource, {
        slug: 'hot',
        position: 2,
      });
      await createProduct(dataSource, {
        slug: 'borscht',
        title: 'Borscht',
        categories: [soups, hot],
      });
      await createProduct(dataSource, {
        slug: 'okroshka',
        title: 'Okroshka',
        categories: [soups],
        available: false,
      });
      await createProduct(dataSource, {
        slug: 'chili',
        title: 'Chili',
        categories: [hot],
      });
      await productsPage([
        {
          type: SectionType.Products,
          data: { source: 'category', categoryId: soups.id },
        },
        {
          type: SectionType.Products,
          data: { source: 'category', categoryId: hot.id },
        },
      ]);

      const [soupSection, hotSection] = (await getPage('menu')).sections;

      expect(productSlugs(soupSection)).toEqual(['borscht']);
      expect(productSlugs(hotSection)).toEqual(['borscht', 'chili']);
      expect(
        soupSection.products[0].categories.map((c: { slug: string }) => c.slug),
      ).toEqual(['soups', 'hot']);
    });

    // Regression: Strapi's default page size capped this list at 25.
    it('shows every product of a large category (no 25-item cap)', async () => {
      const main = await createCategory(dataSource);
      for (let i = 0; i < 30; i++) {
        await createProduct(dataSource, { categories: [main] });
      }
      await productsPage([
        {
          type: SectionType.Products,
          data: { source: 'category', categoryId: main.id },
        },
      ]);

      const [section] = (await getPage('menu')).sections;

      expect(section.products).toHaveLength(30);
    });

    it('keeps the editor order for selected products, without unavailable ones', async () => {
      const first = await createProduct(dataSource, { slug: 'z-first' });
      const hidden = await createProduct(dataSource, {
        slug: 'hidden',
        available: false,
      });
      const second = await createProduct(dataSource, { slug: 'a-second' });
      await productsPage([
        {
          type: SectionType.Products,
          data: {
            source: 'selected',
            productIds: [first.id, hidden.id, second.id],
          },
        },
      ]);

      const [section] = (await getPage('menu')).sections;

      expect(productSlugs(section)).toEqual(['z-first', 'a-second']);
    });
  });

  describe('references to deleted rows (jsonb has no foreign keys)', () => {
    it('still returns 200: a deleted image becomes null, a deleted product disappears', async () => {
      const image = await createMedia(dataSource);
      const kept = await createMedia(dataSource);
      const product = await createProduct(dataSource, { slug: 'deleted' });
      const other = await createProduct(dataSource, { slug: 'kept' });
      const category = await createBlogCategory(dataSource);
      await createPage(dataSource, { slug: 'dangling' }, [
        { type: SectionType.Promo, data: { imageId: image.id } },
        {
          type: SectionType.ImageGallery,
          data: { imageIds: [image.id, kept.id] },
        },
        {
          type: SectionType.Products,
          data: { source: 'selected', productIds: [product.id, other.id] },
        },
        { type: SectionType.News, data: { blogCategoryId: category.id } },
      ]);

      await dataSource.getRepository(Media).delete({ id: image.id });
      await dataSource.getRepository(Product).delete({ id: product.id });
      await dataSource.query('DELETE FROM blog_category WHERE id = $1', [
        category.id,
      ]);

      const [promo, gallery, products, news] = (await getPage('dangling'))
        .sections;

      expect(promo.image).toBeNull();
      expect(gallery.images.map((m: { id: string }) => m.id)).toEqual([
        kept.id,
      ]);
      expect(productSlugs(products)).toEqual(['kept']);
      expect(news.blogCategory).toBeNull();
    });
  });

  describe('performance', () => {
    // One query per kind of referenced row, not per section (no N+1).
    it('runs the same number of queries for 2 sections as for 10', async () => {
      const sectionsReferencingEverything = async (count: number) => {
        const sections: SectionInput[] = [];
        for (let i = 0; i < count / 2; i++) {
          const image = await createMedia(dataSource);
          const category = await createCategory(dataSource);
          await createProduct(dataSource, { categories: [category], image });
          sections.push(
            { type: SectionType.Promo, data: { imageId: image.id } },
            {
              type: SectionType.Products,
              data: { source: 'category', categoryId: category.id },
            },
          );
        }
        return sections;
      };
      await createPage(
        dataSource,
        { slug: 'small' },
        await sectionsReferencingEverything(2),
      );
      await createPage(
        dataSource,
        { slug: 'large' },
        await sectionsReferencingEverything(10),
      );

      const queriesFor = async (slug: string) => {
        const spy = jest.spyOn(PostgresQueryRunner.prototype, 'query');
        try {
          await getPage(slug);
          return spy.mock.calls.length;
        } finally {
          spy.mockRestore();
        }
      };

      expect(await queriesFor('large')).toBe(await queriesFor('small'));
    });
  });

  describe('database constraints', () => {
    it('rejects a duplicate page slug by its constraint name', async () => {
      await createPage(dataSource, { slug: 'twin' });

      await expect(createPage(dataSource, { slug: 'twin' })).rejects.toThrow(
        'UQ_page_slug',
      );
    });

    it('rejects section data that is not a JSON object', async () => {
      const page = await createPage(dataSource);

      await expect(
        dataSource.query(
          `INSERT INTO page_section (page_id, type, data) VALUES ($1, 'contact', '[]')`,
          [page.id],
        ),
      ).rejects.toThrow('CHK_page_section_data_object');
    });

    it('deletes the sections with their page', async () => {
      const page = await createPage(dataSource, {}, [
        { type: SectionType.Contact, data: {} },
        { type: SectionType.News, data: {} },
      ]);

      await dataSource.getRepository(Page).delete({ id: page.id });

      expect(await dataSource.getRepository(PageSection).count()).toBe(0);
    });

    it('lets the factory refuse invalid section data, like the real writers', async () => {
      await expect(
        createPage(dataSource, {}, [
          { type: SectionType.Products, data: { source: 'category' } },
        ]),
      ).rejects.toThrow(/Invalid "products" section data: categoryId/);
    });
  });

  describe('Swagger', () => {
    // The project's real document config (operation IDs, tags, global errors).
    const document = () =>
      SwaggerModule.createDocument(app, buildSwaggerDocumentConfig(), {
        operationIdFactory,
      });
    type Schema = {
      properties: Record<string, Record<string, unknown>>;
    };
    const schemas = () =>
      document().components?.schemas as Record<string, Schema>;

    it('documents the page endpoint under the content tag', () => {
      const operation = document().paths['/api/pages/{slug}'].get;

      expect(operation).toMatchObject({
        operationId: 'Pages_findBySlug',
        tags: ['content'],
      });
      expect(operation?.responses['404']).toMatchObject({
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponseDto' },
          },
        },
      });
    });

    it('documents sections as a oneOf over the 10 types, with a discriminator', () => {
      const items = schemas().PageDto.properties.sections.items as {
        oneOf: { $ref: string }[];
        discriminator: {
          propertyName: string;
          mapping: Record<string, string>;
        };
      };

      expect(items.oneOf).toHaveLength(Object.values(SectionType).length);
      expect(items.discriminator.propertyName).toBe('type');
      expect(Object.keys(items.discriminator.mapping).sort()).toEqual(
        Object.values(SectionType).sort(),
      );
      // Every referenced schema is actually in the document.
      for (const { $ref } of items.oneOf) {
        expect(
          schemas()[$ref.replace('#/components/schemas/', '')],
        ).toBeDefined();
      }
    });

    it('pins each section schema to its single type value', () => {
      const items = schemas().PageDto.properties.sections.items as {
        discriminator: { mapping: Record<string, string> };
      };

      for (const [type, ref] of Object.entries(items.discriminator.mapping)) {
        const name = ref.replace('#/components/schemas/', '');
        expect(schemas()[name].properties.type).toMatchObject({ enum: [type] });
      }
    });

    // SeoDto itself isn't checked here: only the CLI plugin (not run under
    // Jest) links `seo: SeoDto` into the document. Checked in the built docs.
  });
});
