import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Product } from '@/catalog/entities/product.entity';
import { UserRole } from '@/users/entities/user.entity';
import { bearer, loginAs } from './utils/auth';
import { resetDatabase } from './utils/database';
import {
  createCategory,
  createMedia,
  createOrder,
  createProduct,
  createUser,
} from './utils/factories';
import { createTestApp } from './utils/test-app';
import { resetRateLimits } from './utils/throttler';

interface Row {
  id: string;
  [key: string]: unknown;
}

describe('Admin API: catalog (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
    resetRateLimits(app);
    const editor = await createUser(dataSource, { role: UserRole.Editor });
    token = (await loginAs(app, editor)).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const get = (path: string) =>
    http().get(`/api/admin/${path}`).set(bearer(token));
  const post = (path: string, body: object) =>
    http().post(`/api/admin/${path}`).set(bearer(token)).send(body);
  const patch = (path: string, body: object) =>
    http().patch(`/api/admin/${path}`).set(bearer(token)).send(body);
  const del = (path: string) =>
    http().delete(`/api/admin/${path}`).set(bearer(token));
  const rows = (res: request.Response) => (res.body as { data: Row[] }).data;
  const data = (res: request.Response) => (res.body as { data: Row }).data;
  const detailsOf = (res: request.Response) =>
    (res.body as { error: { details?: unknown[] } }).error.details;

  describe('products', () => {
    it('lists every product, available or not, with ids for references', async () => {
      const pizza = await createCategory(dataSource, { name: 'Піца' });
      const image = await createMedia(dataSource);
      const product = await createProduct(dataSource, {
        title: 'Маргарита',
        available: false,
        image,
        categories: [pizza],
      });

      const res = await get('products').expect(200);

      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 1,
        pageCount: 1,
      });
      expect(rows(res)[0]).toEqual({
        id: product.id,
        slug: product.slug,
        title: 'Маргарита',
        description: product.description,
        price: product.price,
        weight: product.weight,
        calories: product.calories,
        available: false,
        featured: false,
        favorite: false,
        imageId: image.id,
        image: expect.objectContaining({ id: image.id, url: image.url }),
        categoryIds: [pizza.id],
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('breaks ties by id in the sort direction: equal titles never swap between pages', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 4; i++) {
        ids.push((await createProduct(dataSource, { title: 'Борщ' })).id);
      }
      const page = async (n: number) =>
        rows(
          await get(
            `products?pageSize=2&page=${n}&sort=title&order=DESC`,
          ).expect(200),
        ).map((p) => p.id);

      expect([...(await page(1)), ...(await page(2))]).toEqual(
        [...ids].sort().reverse(),
      );
    });

    it('pages, sorts and counts products with several categories once', async () => {
      const [a, b] = [
        await createCategory(dataSource),
        await createCategory(dataSource),
      ];
      for (const title of ['Б', 'А', 'В']) {
        await createProduct(dataSource, { title, categories: [a, b] });
      }

      const first = await get(
        'products?pageSize=2&sort=title&order=DESC',
      ).expect(200);
      const second = await get(
        'products?pageSize=2&page=2&sort=title&order=DESC',
      ).expect(200);

      expect(rows(first).map((p) => p.title)).toEqual(['В', 'Б']);
      expect(rows(second).map((p) => p.title)).toEqual(['А']);
      expect(first.body.meta.total).toBe(3);
      expect(rows(first)[0].categoryIds).toHaveLength(2);
    });

    it('filters by search (literal), category, availability and ids', async () => {
      const soups = await createCategory(dataSource);
      const borscht = await createProduct(dataSource, {
        title: 'Борщ 100%',
        categories: [soups],
      });
      const other = await createProduct(dataSource, {
        title: 'Борщ 1000',
        available: false,
      });

      const titles = async (query: string) =>
        rows(await get(`products?${query}`).expect(200)).map((p) => p.title);

      expect(await titles(`q=${encodeURIComponent('борщ 100%')}`)).toEqual([
        'Борщ 100%',
      ]);
      expect(await titles('q=_')).toEqual([]);
      expect(await titles(`categoryId=${soups.id}`)).toEqual(['Борщ 100%']);
      expect(await titles('available=false')).toEqual(['Борщ 1000']);
      expect(await titles(`id=${borscht.id}&id=${other.id}`)).toHaveLength(2);
      expect(await titles(`id=${other.id}`)).toEqual(['Борщ 1000']);
    });

    it.each([
      ['an unknown sort', 'sort=password'],
      ['a bad order', 'order=sideways'],
      ['a bad id', 'id=1'],
      ['a page size over 100', 'pageSize=101'],
    ])('refuses %s with 400', async (_, query) => {
      await get(`products?${query}`).expect(400);
    });

    it('creates a product with categories and an image', async () => {
      const [pizza, hot] = [
        await createCategory(dataSource),
        await createCategory(dataSource),
      ];
      const image = await createMedia(dataSource);

      const res = await post('products', {
        slug: 'margherita',
        title: 'Маргарита',
        price: 18950,
        imageId: image.id,
        categoryIds: [hot.id, pizza.id],
      }).expect(201);

      expect(data(res)).toMatchObject({
        slug: 'margherita',
        price: 18950,
        available: true,
        featured: false,
        imageId: image.id,
        weight: null,
      });
      expect((data(res).categoryIds as string[]).sort()).toEqual(
        [hot.id, pizza.id].sort(),
      );
      // The public API shows it straight away.
      await http().get('/api/products/margherita').expect(200);
    });

    it('cleans the description: no scripts reach the site', async () => {
      const res = await post('products', {
        slug: 'soup',
        title: 'Суп',
        price: 100,
        description: '<p onclick="steal()">Гарячий</p><script>steal()</script>',
      }).expect(201);

      expect(data(res).description).toBe('<p>Гарячий</p>');
    });

    it('changes only the fields sent; null clears an optional one', async () => {
      const image = await createMedia(dataSource);
      const product = await createProduct(dataSource, { image, weight: 300 });

      const res = await patch(`products/${product.id}`, {
        price: 25000,
        imageId: null,
        weight: null,
      }).expect(200);

      expect(data(res)).toMatchObject({
        title: product.title,
        price: 25000,
        imageId: null,
        weight: null,
      });
    });

    it.each([
      ['a required field set to null', { title: null }, 'title'],
      ['a negative price', { price: -1 }, 'price'],
      ['a price in hryvnias with a fraction', { price: 189.5 }, 'price'],
      ['a slug with capitals', { slug: 'Borscht' }, 'slug'],
      ['a weight of 0', { weight: 0 }, 'weight'],
    ])('refuses %s, naming the field', async (_, body, field) => {
      const product = await createProduct(dataSource);

      const res = await patch(`products/${product.id}`, body).expect(400);

      expect(detailsOf(res)).toEqual([expect.objectContaining({ field })]);
    });

    it.each([
      ['a read-only field', { image: null }],
      ['an unknown field', { secret: 1 }],
      ['the id', { id: '01a1559c-a1ed-7641-ac0e-64612b99bb5a' }],
    ])('refuses %s (400), changing nothing', async (_, body) => {
      const product = await createProduct(dataSource);

      await patch(`products/${product.id}`, body).expect(400);
    });

    it('refuses an image or category that does not exist', async () => {
      const product = await createProduct(dataSource);
      const missing = '01a1559c-a1ed-7641-ac0e-64612b99bb5a';

      for (const [field, body] of [
        ['imageId', { imageId: missing }],
        ['categoryIds', { categoryIds: [missing] }],
      ] as const) {
        const res = await patch(`products/${product.id}`, body).expect(400);
        expect(detailsOf(res)).toEqual([
          {
            field,
            messages: [`${field} refers to a record that doesn't exist`],
          },
        ]);
      }
    });

    it('answers a taken slug with 409 SLUG_TAKEN, on the field', async () => {
      await createProduct(dataSource, { slug: 'borscht' });
      const other = await createProduct(dataSource);

      const res = await patch(`products/${other.id}`, {
        slug: 'borscht',
      }).expect(409);

      expect(res.body.error).toMatchObject({
        code: 'SLUG_TAKEN',
        details: [{ field: 'slug', messages: ['slug is already in use'] }],
      });
    });

    it('deletes a product; past orders keep their copy', async () => {
      const product = await createProduct(dataSource, { title: 'Борщ' });
      const order = await createOrder(dataSource, {}, [{ product }]);

      await del(`products/${product.id}`).expect(204);

      await get(`products/${product.id}`).expect(404);
      const item = await dataSource.query<
        { title: string; product_id: null }[]
      >('SELECT title, product_id FROM order_item WHERE order_id = $1', [
        order.id,
      ]);
      expect(item).toEqual([{ title: 'Борщ', product_id: null }]);
      await del(`products/${product.id}`).expect(404);
    });
  });

  describe('product categories', () => {
    it('lists them by position, creates, renames and deletes an empty one', async () => {
      await createCategory(dataSource, { name: 'Друга', position: 2 });
      await createCategory(dataSource, { name: 'Перша', position: 1 });

      const list = await get('product-categories').expect(200);
      expect(rows(list).map((c) => c.name)).toEqual(['Перша', 'Друга']);

      const created = data(
        await post('product-categories', {
          name: 'Супи',
          slug: 'soups',
        }).expect(201),
      );
      expect(created).toMatchObject({
        name: 'Супи',
        slug: 'soups',
        position: 0,
      });

      await patch(`product-categories/${created.id}`, {
        name: 'Перші страви',
      }).expect(200);
      await del(`product-categories/${created.id}`).expect(204);
      await get(`product-categories/${created.id}`).expect(404);
    });

    it('refuses to delete a category with products: 409 CATEGORY_IN_USE', async () => {
      const pizza = await createCategory(dataSource);
      await createProduct(dataSource, { categories: [pizza] });

      const res = await del(`product-categories/${pizza.id}`).expect(409);

      expect(res.body.error.code).toBe('CATEGORY_IN_USE');
      expect(
        await dataSource.getRepository(Product).count({
          where: { categories: { id: pizza.id } },
        }),
      ).toBe(1);
    });

    it('answers a taken slug with 409 SLUG_TAKEN', async () => {
      await createCategory(dataSource, { slug: 'pizza' });

      const res = await post('product-categories', {
        name: 'Піца',
        slug: 'pizza',
      }).expect(409);

      expect(res.body.error.code).toBe('SLUG_TAKEN');
    });
  });
});
