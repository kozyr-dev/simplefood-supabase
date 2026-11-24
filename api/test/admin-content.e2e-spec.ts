import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { MenuItemGroup } from '@/content/entities/menu-item.entity';
import { MenuKey } from '@/content/entities/menu.entity';
import { SectionType } from '@/content/entities/page-section.entity';
import { UserRole } from '@/users/entities/user.entity';
import { adminApi, dataOf, errorOf, rowsOf } from './utils/admin';
import { loginAs } from './utils/auth';
import { resetDatabase } from './utils/database';
import {
  createBlogCategory,
  createCategory,
  createMedia,
  createMenu,
  createPage,
  createProduct,
  createSettings,
  createUser,
} from './utils/factories';
import { createTestApp } from './utils/test-app';
import { resetRateLimits } from './utils/throttler';

const MISSING = '01a1559c-a1ed-7641-ac0e-64612b99bb5a';

describe('Admin API: content (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let admin: ReturnType<typeof adminApi>;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
    resetRateLimits(app);
    const editor = await createUser(dataSource, { role: UserRole.Editor });
    admin = adminApi(app, (await loginAs(app, editor)).accessToken);
  });

  afterAll(async () => {
    await app.close();
  });

  const site = () => request(app.getHttpServer());

  describe('settings', () => {
    it('reads and changes the one record; the site shows the change', async () => {
      await createSettings(dataSource, { siteName: 'SimpleFood' });

      const before = dataOf(await admin.get('settings').expect(200));
      expect(before).toMatchObject({ id: 1, siteName: 'SimpleFood' });

      const after = dataOf(
        await admin
          .patch('settings', { phone: '+380 44 000 00 00', instagram: null })
          .expect(200),
      );
      expect(after).toMatchObject({
        siteName: 'SimpleFood',
        phone: '+380 44 000 00 00',
        instagram: null,
      });
      const { data } = (await site().get('/api/settings').expect(200)).body;
      expect(data.phone).toBe('+380 44 000 00 00');
    });

    it('creates the record on the first save, which needs a site name', async () => {
      expect(dataOf(await admin.get('settings').expect(200)).siteName).toBe('');

      const res = await admin.patch('settings', { phone: '1' }).expect(400);
      expect(errorOf(res).details).toEqual([
        { field: 'siteName', messages: ['siteName is required'] },
      ]);

      await admin.patch('settings', { siteName: 'SimpleFood' }).expect(200);
      await site().get('/api/settings').expect(200);
    });

    it.each([
      [
        'an http social link',
        { facebook: 'http://facebook.com/x' },
        'facebook',
      ],
      ['an empty site name', { siteName: '' }, 'siteName'],
    ])('refuses %s', async (_, body, field) => {
      await createSettings(dataSource);

      const res = await admin.patch('settings', body).expect(400);

      expect(errorOf(res).details?.map((d) => d.field)).toEqual([field]);
    });
  });

  describe('menus and items', () => {
    it('lists the menus with their item counts', async () => {
      await createMenu(dataSource, MenuKey.Footer, [{}, {}]);
      await createMenu(dataSource, MenuKey.Header);

      const rows = rowsOf(await admin.get('menus').expect(200));

      expect(rows.map((m) => [m.key, m.itemCount])).toEqual([
        ['header', 0],
        ['footer', 2],
      ]);
    });

    it('adds items at the end of their group, edits and deletes them', async () => {
      const menu = await createMenu(dataSource, MenuKey.Dropdown, [
        { title: 'A', position: 0 },
      ]);

      const added = dataOf(
        await admin
          .post('menu-items', { menuId: menu.id, title: 'B', link: '/b' })
          .expect(201),
      );
      const listed = dataOf(
        await admin
          .post('menu-items', {
            menuId: menu.id,
            title: 'L',
            link: '#l',
            group: 'list',
          })
          .expect(201),
      );
      expect([added.position, added.group, listed.position]).toEqual([
        1,
        'main',
        0,
      ]);

      await admin
        .patch(`menu-items/${added.id}`, { title: 'B2', className: null })
        .expect(200);
      const items = rowsOf(
        await admin.get(`menu-items?menuId=${menu.id}&group=main`).expect(200),
      );
      expect(items.map((i) => i.title)).toEqual(['A', 'B2']);

      await admin.del(`menu-items/${added.id}`).expect(204);
    });

    it('reorders a group in one call; the site shows the new order', async () => {
      const menu = await createMenu(dataSource, MenuKey.Header, [
        { title: 'A', position: 0 },
        { title: 'B', position: 1 },
        { title: 'C', position: 2 },
      ]);
      const [a, b, c] = menu.items;

      const res = await admin
        .put(`menus/${menu.id}/items/order`, {
          group: 'main',
          ids: [c.id, a.id, b.id],
        })
        .expect(200);

      expect(rowsOf(res).map((i) => [i.title, i.position])).toEqual([
        ['C', 0],
        ['A', 1],
        ['B', 2],
      ]);
      const { data } = (await site().get('/api/menus/header').expect(200)).body;
      expect(JSON.stringify(data).match(/"title":"[ABC]"/g)).toEqual([
        '"title":"C"',
        '"title":"A"',
        '"title":"B"',
      ]);
    });

    it.each([
      ['a missing item', (ids: string[]) => ids.slice(1)],
      ['a foreign item', (ids: string[]) => [...ids.slice(1), MISSING]],
    ])(
      'refuses an order with %s: 400 ORDER_MISMATCH, nothing changes',
      async (_, change) => {
        const menu = await createMenu(dataSource, MenuKey.Header, [
          { title: 'A', position: 0 },
          { title: 'B', position: 1 },
        ]);

        const res = await admin
          .put(`menus/${menu.id}/items/order`, {
            group: MenuItemGroup.Main,
            ids: change(menu.items.map((i) => i.id)),
          })
          .expect(400);

        expect(errorOf(res).code).toBe('ORDER_MISMATCH');
        const items = rowsOf(
          await admin.get(`menu-items?menuId=${menu.id}`).expect(200),
        );
        expect(items.map((i) => i.title)).toEqual(['A', 'B']);
      },
    );

    it('refuses a script link', async () => {
      const menu = await createMenu(dataSource, MenuKey.Header);

      await admin
        .post('menu-items', {
          menuId: menu.id,
          title: 'x',
          link: 'javascript:alert(1)',
        })
        .expect(400);
    });
  });

  describe('pages', () => {
    it('lists pages with their state and section count; searches title and slug', async () => {
      await createPage(dataSource, { slug: 'about', title: 'Про нас' }, [
        { type: SectionType.Content, data: { title: 'x' } },
      ]);
      await createPage(dataSource, {
        slug: 'draft',
        title: 'Чернетка',
        publishedAt: null,
      });

      const rows = rowsOf(await admin.get('pages?sort=slug').expect(200));
      expect(rows.map((p) => [p.slug, p.state, p.sectionCount])).toEqual([
        ['about', 'published', 1],
        ['draft', 'draft', 0],
      ]);
      expect(rowsOf(await admin.get('pages?q=about').expect(200))).toHaveLength(
        1,
      );
      expect(
        rowsOf(
          await admin
            .get(`pages?q=${encodeURIComponent('чернет')}`)
            .expect(200),
        ),
      ).toHaveLength(1);
    });

    it('creates a draft page; the site shows it once published', async () => {
      const page = dataOf(
        await admin
          .post('pages', { slug: 'promo', title: 'Акції' })
          .expect(201),
      );
      expect(page).toMatchObject({ state: 'draft', sectionCount: 0 });
      await site().get('/api/pages/promo').expect(404);

      await admin
        .patch(`pages/${page.id}`, {
          publishedAt: new Date(Date.now() - 1000).toISOString(),
        })
        .expect(200);
      await site().get('/api/pages/promo').expect(200);
    });

    it('keeps the homepage: no new slug (400 HOME_PAGE), no delete (409 HOME_PAGE)', async () => {
      const home = await createPage(dataSource, { slug: 'home' });

      const rename = await admin
        .patch(`pages/${home.id}`, { slug: 'start' })
        .expect(400);
      expect(errorOf(rename)).toMatchObject({
        code: 'HOME_PAGE',
        details: [
          { field: 'slug', messages: ['the homepage keeps the slug "home"'] },
        ],
      });
      await admin
        .patch(`pages/${home.id}`, { title: 'Головна', slug: 'home' })
        .expect(200);
      expect(
        errorOf(await admin.del(`pages/${home.id}`).expect(409)).code,
      ).toBe('HOME_PAGE');
    });

    it('deletes a page with its sections', async () => {
      const page = await createPage(dataSource, {}, [
        { type: SectionType.Content, data: {} },
      ]);

      await admin.del(`pages/${page.id}`).expect(204);

      expect(
        rowsOf(await admin.get(`page-sections?pageId=${page.id}`).expect(200)),
      ).toEqual([]);
    });

    it('answers a taken slug with 409 SLUG_TAKEN', async () => {
      await createPage(dataSource, { slug: 'about' });

      const res = await admin
        .post('pages', { slug: 'about', title: 'x' })
        .expect(409);

      expect(errorOf(res).code).toBe('SLUG_TAKEN');
    });
  });

  describe('page sections', () => {
    it('adds a section at the end, checked against its type; the site shows it', async () => {
      const page = await createPage(dataSource, { slug: 'menu' }, [
        { type: SectionType.Content, data: { title: 'first' } },
      ]);
      const [pizza, soup] = [
        await createProduct(dataSource, { title: 'Піца' }),
        await createProduct(dataSource, { title: 'Суп' }),
      ];

      const res = await admin
        .post('page-sections', {
          pageId: page.id,
          type: 'products',
          data: {
            title: 'Хіти',
            source: 'selected',
            productIds: [soup.id, pizza.id],
            anchorId: '',
            categoryId: null,
          },
        })
        .expect(201);

      expect(dataOf(res)).toMatchObject({
        pageId: page.id,
        type: 'products',
        position: 1,
        data: {
          title: 'Хіти',
          source: 'selected',
          productIds: [soup.id, pizza.id],
        },
        references: {
          products: expect.arrayContaining([
            { id: soup.id, label: 'Суп' },
            { id: pizza.id, label: 'Піца' },
          ]),
        },
      });
      const { data } = (await site().get('/api/pages/menu').expect(200)).body;
      expect(
        data.sections[1].products.map((p: { title: string }) => p.title),
      ).toEqual(['Суп', 'Піца']);
    });

    it('answers invalid data with 400, fields under data.', async () => {
      const page = await createPage(dataSource);

      const res = await admin
        .post('page-sections', {
          pageId: page.id,
          type: 'products',
          data: { source: 'selected', layout: 'circle' },
        })
        .expect(400);

      expect(
        errorOf(res)
          .details?.map((d) => d.field)
          .sort(),
      ).toEqual(['data.layout', 'data.productIds']);
    });

    it('cleans HTML fields and keeps only an allowed map iframe', async () => {
      const page = await createPage(dataSource);

      const res = await admin
        .post('page-sections', {
          pageId: page.id,
          type: 'contact',
          data: {
            content: '<p>Адреса<img src="x" onerror="steal()"></p>',
            mapEmbedCode:
              '<iframe src="https://www.google.com/maps/embed?pb=1"></iframe><script>steal()</script>',
          },
        })
        .expect(201);

      expect(dataOf(res).data).toEqual({
        content: '<p>Адреса<img src="x" /></p>',
        mapEmbedCode:
          '<iframe src="https://www.google.com/maps/embed?pb=1"></iframe>',
      });
    });

    it('refuses an embed code from another site', async () => {
      const page = await createPage(dataSource);

      const res = await admin
        .post('page-sections', {
          pageId: page.id,
          type: 'content',
          data: { embedCode: '<iframe src="https://evil.example"></iframe>' },
        })
        .expect(400);

      expect(errorOf(res).details?.[0].field).toBe('data.embedCode');
    });

    it('replaces the data on update; the type stays', async () => {
      const page = await createPage(dataSource, {}, [
        {
          type: SectionType.Video,
          data: { title: 'old', videoUrl: 'https://www.youtube.com/embed/a' },
        },
      ]);
      const [section] = page.sections;

      const res = await admin
        .patch(`page-sections/${section.id}`, { data: { title: 'new' } })
        .expect(200);
      expect(dataOf(res)).toMatchObject({
        type: 'video',
        data: { title: 'new' },
      });

      await admin
        .patch(`page-sections/${section.id}`, { type: 'content', data: {} })
        .expect(400);
    });

    it('shows the names behind every kind of id', async () => {
      const [image, icon] = [
        await createMedia(dataSource, { name: 'banner.jpg' }),
        await createMedia(dataSource, { name: 'icon.png' }),
      ];
      const category = await createCategory(dataSource, { name: 'Піца' });
      const news = await createBlogCategory(dataSource, { name: 'Новини' });
      const page = await createPage(dataSource, {}, [
        { type: SectionType.ImageBanner, data: { imageId: image.id } },
        { type: SectionType.Benefits, data: { items: [{ iconId: icon.id }] } },
        {
          type: SectionType.Products,
          data: { source: 'category', categoryId: category.id },
        },
        { type: SectionType.News, data: { blogCategoryId: news.id } },
      ]);
      const refs = async (index: number) =>
        dataOf(
          await admin
            .get(`page-sections/${page.sections[index].id}`)
            .expect(200),
        ).references as Record<string, { label: string }[]>;

      expect((await refs(0)).media.map((m) => m.label)).toEqual(['banner.jpg']);
      expect((await refs(1)).media.map((m) => m.label)).toEqual(['icon.png']);
      expect((await refs(2)).productCategories.map((c) => c.label)).toEqual([
        'Піца',
      ]);
      expect((await refs(3)).blogCategories.map((c) => c.label)).toEqual([
        'Новини',
      ]);
    });

    it('reorders a page in one call, and refuses a stale order', async () => {
      const page = await createPage(dataSource, { slug: 'p' }, [
        { type: SectionType.Content, data: { title: 'A' } },
        { type: SectionType.Content, data: { title: 'B' } },
      ]);
      const [a, b] = page.sections;

      await admin
        .put(`pages/${page.id}/sections/order`, { ids: [b.id, a.id] })
        .expect(200);

      const { data } = (await site().get('/api/pages/p').expect(200)).body;
      expect(data.sections.map((s: { title: string }) => s.title)).toEqual([
        'B',
        'A',
      ]);
      expect(
        errorOf(
          await admin
            .put(`pages/${page.id}/sections/order`, { ids: [a.id] })
            .expect(400),
        ).code,
      ).toBe('ORDER_MISMATCH');
    });

    it('refuses a section for a page that does not exist', async () => {
      const res = await admin
        .post('page-sections', { pageId: MISSING, type: 'content', data: {} })
        .expect(400);

      expect(errorOf(res).details?.[0].field).toBe('pageId');
    });
  });
});
