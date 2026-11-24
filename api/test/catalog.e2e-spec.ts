import { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import type { ProductDto } from '@/catalog/dto/product.dto';
import {
  buildSwaggerDocumentConfig,
  operationIdFactory,
} from '@/config/swagger.config';
import { Media } from '@/media/entities/media.entity';
import { resetDatabase } from './utils/database';
import { createCategory, createMedia, createProduct } from './utils/factories';
import { createTestApp } from './utils/test-app';

describe('Catalog (e2e)', () => {
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
  const slugs = (body: { data: ProductDto[] }) =>
    body.data.map((product) => product.slug);

  describe('GET /api/products', () => {
    it('returns an empty page when there are no products', async () => {
      const res = await http().get('/api/products').expect(200);

      expect(res.body).toEqual({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0, pageCount: 0 },
      });
    });

    it('paginates, ordered by title', async () => {
      for (let i = 1; i <= 25; i++) {
        await createProduct(dataSource, {
          title: `Dish ${String(i).padStart(2, '0')}`,
        });
      }

      const res = await http()
        .get('/api/products?pageSize=10&page=3')
        .expect(200);

      expect(res.body.data.map((p: ProductDto) => p.title)).toEqual([
        'Dish 21',
        'Dish 22',
        'Dish 23',
        'Dish 24',
        'Dish 25',
      ]);
      expect(res.body.meta).toEqual({
        page: 3,
        pageSize: 10,
        total: 25,
        pageCount: 3,
      });
    });

    it('never repeats or skips products with the same title across pages', async () => {
      const first = await createProduct(dataSource, { title: 'Pizza' });
      const second = await createProduct(dataSource, { title: 'Pizza' });

      const page1 = await http().get('/api/products?pageSize=1&page=1');
      const page2 = await http().get('/api/products?pageSize=1&page=2');

      expect([...slugs(page1.body), ...slugs(page2.body)]).toEqual(
        [first, second].map((p) => p.slug), // id tie-breaker: creation order
      );
    });

    it('filters by category slug, keeping all categories of each product', async () => {
      const pizza = await createCategory(dataSource, {
        name: 'Pizza',
        slug: 'pizza',
        position: 1,
      });
      const hot = await createCategory(dataSource, {
        name: 'Hot',
        slug: 'hot',
        position: 2,
      });
      await createProduct(dataSource, {
        slug: 'pepperoni',
        title: 'Pepperoni',
        categories: [pizza, hot],
      });
      await createProduct(dataSource, {
        slug: 'margherita',
        title: 'Margherita',
        categories: [pizza],
      });
      await createProduct(dataSource, {
        slug: 'chili-soup',
        title: 'Chili soup',
        categories: [hot],
      });

      const res = await http().get('/api/products?category=pizza').expect(200);

      expect(slugs(res.body)).toEqual(['margherita', 'pepperoni']);
      expect(res.body.meta.total).toBe(2);
      const pepperoni = res.body.data.find(
        (p: ProductDto) => p.slug === 'pepperoni',
      );
      expect(pepperoni.categories.map((c: { slug: string }) => c.slug)).toEqual(
        ['pizza', 'hot'],
      );
    });

    it('returns an empty list (not 404) for an unknown category', async () => {
      await createProduct(dataSource);

      const res = await http()
        .get('/api/products?category=unknown')
        .expect(200);

      expect(res.body.data).toEqual([]);
    });

    it.each([
      ['featured=true', ['special']],
      ['featured=false', ['regular']],
    ])('filters by %s', async (query, expected) => {
      await createProduct(dataSource, { slug: 'special', featured: true });
      await createProduct(dataSource, { slug: 'regular', featured: false });

      const res = await http().get(`/api/products?${query}`).expect(200);

      expect(slugs(res.body)).toEqual(expected);
    });

    it('filters by favorite', async () => {
      await createProduct(dataSource, { slug: 'loved', favorite: true });
      await createProduct(dataSource, { slug: 'other', favorite: false });

      const res = await http().get('/api/products?favorite=true').expect(200);

      expect(slugs(res.body)).toEqual(['loved']);
    });

    it.each(['featured=yes', 'favorite=1', 'pageSize=101', 'page=0'])(
      'rejects ?%s with a 400 in the error shape',
      async (query) => {
        const res = await http().get(`/api/products?${query}`).expect(400);

        expect(res.body.error).toMatchObject({
          code: 'BAD_REQUEST',
          message: 'Validation failed',
        });
      },
    );

    it('returns the price as an integer number of kopiykas', async () => {
      await createProduct(dataSource, { price: 18900 });

      const [product] = (await http().get('/api/products').expect(200)).body
        .data;

      expect(product.price).toBe(18900);
    });
  });

  describe('GET /api/products/:slug', () => {
    it('returns the product with its image and categories', async () => {
      const image = await createMedia(dataSource, { alt: 'Borscht' });
      const soups = await createCategory(dataSource, { slug: 'soups' });
      await createProduct(dataSource, {
        slug: 'borscht',
        title: 'Borscht',
        image,
        categories: [soups],
      });

      const res = await http().get('/api/products/borscht').expect(200);

      expect(res.body.data).toMatchObject({
        slug: 'borscht',
        title: 'Borscht',
        image: { id: image.id, url: image.url, alt: 'Borscht' },
        categories: [{ id: soups.id, slug: 'soups' }],
      });
    });

    it('returns image: null for a product without a photo', async () => {
      await createProduct(dataSource, { slug: 'plain' });

      const res = await http().get('/api/products/plain').expect(200);

      expect(res.body.data.image).toBeNull();
    });

    it('returns a 404 in the error shape for an unknown slug', async () => {
      const res = await http().get('/api/products/nope').expect(404);

      expect(res.body).toEqual({
        error: {
          status: 404,
          code: 'NOT_FOUND',
          message: 'Product not found',
          requestId: expect.any(String),
        },
      });
    });

    it('keeps the product when its image file is deleted (ON DELETE SET NULL)', async () => {
      const image = await createMedia(dataSource);
      await createProduct(dataSource, { slug: 'kept', image });

      await dataSource.getRepository(Media).delete({ id: image.id });

      const res = await http().get('/api/products/kept').expect(200);
      expect(res.body.data.image).toBeNull();
    });
  });

  describe('GET /api/product-categories', () => {
    it('returns all categories by position, then name', async () => {
      await createCategory(dataSource, { name: 'Soups', position: 2 });
      await createCategory(dataSource, { name: 'Drinks', position: 2 });
      await createCategory(dataSource, { name: 'Pizza', position: 1 });

      const res = await http().get('/api/product-categories').expect(200);

      expect(res.body.data.map((c: { name: string }) => c.name)).toEqual([
        'Pizza',
        'Drinks',
        'Soups',
      ]);
      expect(Object.keys(res.body.data[0]).sort()).toEqual([
        'id',
        'name',
        'slug',
      ]);
    });
  });

  describe('database constraints', () => {
    it('rejects a duplicate product slug by its constraint name', async () => {
      await createProduct(dataSource, { slug: 'twin' });

      await expect(createProduct(dataSource, { slug: 'twin' })).rejects.toThrow(
        'UQ_product_slug',
      );
    });

    it('rejects a negative price', async () => {
      await expect(createProduct(dataSource, { price: -1 })).rejects.toThrow(
        'CHK_product_price_non_negative',
      );
    });
  });

  describe('Swagger', () => {
    // The project's real document config (operation IDs, tags, global errors).
    const document = () =>
      SwaggerModule.createDocument(app, buildSwaggerDocumentConfig(), {
        operationIdFactory,
      });

    it('documents the list as a paginated envelope of ProductDto', () => {
      const ok = document().paths['/api/products'].get?.responses['200'] as {
        content: Record<string, { schema: { properties: unknown } }>;
      };

      expect(ok.content['application/json'].schema.properties).toEqual({
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/ProductDto' },
        },
        meta: { $ref: '#/components/schemas/PaginationMetaDto' },
      });
    });

    it('uses short operation IDs and the catalog tag', () => {
      const paths = document().paths;

      expect(paths['/api/products'].get).toMatchObject({
        operationId: 'Products_findAll',
        tags: ['catalog'],
      });
      expect(paths['/api/products/{slug}'].get?.operationId).toBe(
        'Products_findBySlug',
      );
      expect(paths['/api/product-categories'].get?.operationId).toBe(
        'ProductCategories_findAll',
      );
    });

    it('documents the 404 of /products/{slug} with the error shape', () => {
      expect(
        document().paths['/api/products/{slug}'].get?.responses['404'],
      ).toMatchObject({
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponseDto' },
          },
        },
      });
    });
  });
});
