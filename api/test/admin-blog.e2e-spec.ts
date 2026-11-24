import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { UserRole } from '@/users/entities/user.entity';
import { adminApi, dataOf, errorOf, rowsOf } from './utils/admin';
import { loginAs } from './utils/auth';
import { resetDatabase } from './utils/database';
import {
  createBlogCategory,
  createBlogPost,
  createMedia,
  createUser,
  daysFromNow,
} from './utils/factories';
import { createTestApp } from './utils/test-app';
import { resetRateLimits } from './utils/throttler';

describe('Admin API: blog (e2e)', () => {
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

  it('lists drafts, scheduled and published posts, with their state, and filters by it', async () => {
    await createBlogPost(dataSource, { title: 'Draft', publishedAt: null });
    await createBlogPost(dataSource, {
      title: 'Later',
      publishedAt: daysFromNow(3),
    });
    await createBlogPost(dataSource, {
      title: 'Out',
      publishedAt: daysFromNow(-3),
    });

    const all = rowsOf(await admin.get('blog-posts?sort=title').expect(200));
    expect(all.map((p) => [p.title, p.state])).toEqual([
      ['Draft', 'draft'],
      ['Later', 'scheduled'],
      ['Out', 'published'],
    ]);
    for (const state of ['draft', 'scheduled', 'published']) {
      const rows = rowsOf(
        await admin.get(`blog-posts?state=${state}`).expect(200),
      );
      expect(rows.map((p) => p.state)).toEqual([state]);
    }
  });

  it('creates a scheduled post with an image, categories and SEO; the site shows it only when due', async () => {
    const news = await createBlogCategory(dataSource);
    const [image, share] = [
      await createMedia(dataSource),
      await createMedia(dataSource),
    ];

    const res = await admin
      .post('blog-posts', {
        slug: 'new-menu',
        title: 'Нове меню',
        text: '**Нове** меню',
        imageId: image.id,
        categoryIds: [news.id],
        seo: { title: 'Нове меню', shareImageId: share.id },
        publishedAt: daysFromNow(1).toISOString(),
      })
      .expect(201);

    expect(dataOf(res)).toMatchObject({
      slug: 'new-menu',
      state: 'scheduled',
      imageId: image.id,
      categoryIds: [news.id],
      seo: { title: 'Нове меню', description: null, shareImageId: share.id },
    });
    await request(app.getHttpServer())
      .get('/api/blog-posts/new-menu')
      .expect(404);

    await admin
      .patch(`blog-posts/${dataOf(res).id}`, {
        publishedAt: daysFromNow(-1).toISOString(),
      })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/blog-posts/new-menu')
      .expect(200);
  });

  it('keeps markdown as written (the site never runs HTML in it)', async () => {
    const text = '# Заголовок\n\n<b>як текст</b> > цитата';
    const res = await admin
      .post('blog-posts', { slug: 'md', title: 'MD', text })
      .expect(201);

    expect(dataOf(res).text).toBe(text);
  });

  it('changes one SEO field without touching the others; null clears it', async () => {
    const share = await createMedia(dataSource);
    const post = dataOf(
      await admin
        .post('blog-posts', {
          slug: 'p',
          title: 'P',
          text: 'x',
          seo: { title: 'T', description: 'D', shareImageId: share.id },
        })
        .expect(201),
    );

    const res = await admin
      .patch(`blog-posts/${post.id}`, { seo: { description: null } })
      .expect(200);

    expect(dataOf(res).seo).toEqual({
      title: 'T',
      description: null,
      shareImageId: share.id,
    });
  });

  it.each([
    [
      'an unknown share image',
      { seo: { shareImageId: '01a1559c-a1ed-7641-ac0e-64612b99bb5a' } },
      'seo.shareImageId',
    ],
    ['an unknown SEO field', { seo: { keywords: 'x' } }, 'seo.keywords'],
    ['a non-ISO date', { publishedAt: 'tomorrow' }, 'publishedAt'],
    ['empty text', { text: '' }, 'text'],
  ])('refuses %s, naming the field', async (_, body, field) => {
    const post = await createBlogPost(dataSource);

    const res = await admin.patch(`blog-posts/${post.id}`, body).expect(400);

    expect(errorOf(res).details?.map((d) => d.field)).toEqual([field]);
  });

  it('answers a taken slug with 409 SLUG_TAKEN', async () => {
    await createBlogPost(dataSource, { slug: 'taken' });

    const res = await admin
      .post('blog-posts', { slug: 'taken', title: 'x', text: 'x' })
      .expect(409);

    expect(errorOf(res).code).toBe('SLUG_TAKEN');
  });

  it('deletes a post', async () => {
    const post = await createBlogPost(dataSource);

    await admin.del(`blog-posts/${post.id}`).expect(204);
    await admin.get(`blog-posts/${post.id}`).expect(404);
  });

  describe('categories', () => {
    it('creates, renames and deletes an empty one; refuses one with posts', async () => {
      const created = dataOf(
        await admin
          .post('blog-categories', { name: 'Новини', slug: 'news' })
          .expect(201),
      );
      await admin
        .patch(`blog-categories/${created.id}`, { name: 'Події' })
        .expect(200);
      expect(
        rowsOf(await admin.get('blog-categories').expect(200)).map(
          (c) => c.name,
        ),
      ).toEqual(['Події']);

      const used = await createBlogCategory(dataSource);
      await createBlogPost(dataSource, { categories: [used] });
      expect(
        errorOf(await admin.del(`blog-categories/${used.id}`).expect(409)).code,
      ).toBe('CATEGORY_IN_USE');

      await admin.del(`blog-categories/${created.id}`).expect(204);
    });
  });
});
