import { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import type { BlogPostSummaryDto } from '@/blog/dto/blog-post-summary.dto';
import { BlogCategory } from '@/blog/entities/blog-category.entity';
import { BlogPost } from '@/blog/entities/blog-post.entity';
import {
  buildSwaggerDocumentConfig,
  operationIdFactory,
} from '@/config/swagger.config';
import { Media } from '@/media/entities/media.entity';
import { resetDatabase } from './utils/database';
import {
  createBlogCategory,
  createBlogPost,
  createMedia,
  daysFromNow,
} from './utils/factories';
import { createTestApp } from './utils/test-app';

describe('Blog (e2e)', () => {
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
  const slugs = (body: { data: BlogPostSummaryDto[] }) =>
    body.data.map((post) => post.slug);

  describe('GET /api/blog-posts', () => {
    it('returns an empty page when there are no posts', async () => {
      const res = await http().get('/api/blog-posts').expect(200);

      expect(res.body).toEqual({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0, pageCount: 0 },
      });
    });

    it('lists only published posts, and counts only those', async () => {
      await createBlogPost(dataSource, { slug: 'published' });
      await createBlogPost(dataSource, { slug: 'draft', publishedAt: null });
      await createBlogPost(dataSource, {
        slug: 'scheduled',
        publishedAt: daysFromNow(1),
      });

      const res = await http().get('/api/blog-posts').expect(200);

      expect(slugs(res.body)).toEqual(['published']);
      expect(res.body.meta.total).toBe(1);
    });

    it('paginates, newest first', async () => {
      for (let i = 1; i <= 5; i++) {
        await createBlogPost(dataSource, {
          slug: `day-${i}`,
          publishedAt: daysFromNow(-10 + i), // day-5 is the newest
        });
      }

      const res = await http()
        .get('/api/blog-posts?pageSize=2&page=2')
        .expect(200);

      expect(slugs(res.body)).toEqual(['day-3', 'day-2']);
      expect(res.body.meta).toEqual({
        page: 2,
        pageSize: 2,
        total: 5,
        pageCount: 3,
      });
    });

    it('never repeats or skips posts published at the same moment across pages', async () => {
      const publishedAt = daysFromNow(-1);
      const first = await createBlogPost(dataSource, { publishedAt });
      const second = await createBlogPost(dataSource, { publishedAt });

      const page1 = await http().get('/api/blog-posts?pageSize=1&page=1');
      const page2 = await http().get('/api/blog-posts?pageSize=1&page=2');

      expect([...slugs(page1.body), ...slugs(page2.body)]).toEqual(
        [second, first].map((p) => p.slug), // id DESC: uuidv7 = creation order
      );
    });

    it('filters by category slug, keeping all categories of each post', async () => {
      const news = await createBlogCategory(dataSource, {
        name: 'News',
        slug: 'news',
      });
      const events = await createBlogCategory(dataSource, {
        name: 'Events',
        slug: 'events',
      });
      await createBlogPost(dataSource, {
        slug: 'opening',
        categories: [news, events],
      });
      await createBlogPost(dataSource, { slug: 'menu', categories: [news] });
      await createBlogPost(dataSource, {
        slug: 'party',
        categories: [events],
      });

      const res = await http().get('/api/blog-posts?category=news').expect(200);

      expect(slugs(res.body).sort()).toEqual(['menu', 'opening']);
      expect(res.body.meta.total).toBe(2);
      const opening = res.body.data.find(
        (p: BlogPostSummaryDto) => p.slug === 'opening',
      );
      expect(opening.categories.map((c: { slug: string }) => c.slug)).toEqual(
        ['events', 'news'], // by name
      );
    });

    it('returns an empty list (not 404) for an unknown category', async () => {
      await createBlogPost(dataSource);

      const res = await http()
        .get('/api/blog-posts?category=unknown')
        .expect(200);

      expect(res.body.data).toEqual([]);
    });

    it('returns a plain-text excerpt instead of the full text', async () => {
      await createBlogPost(dataSource, {
        text: '## Autumn menu\n\nTry our **borscht**.',
      });

      const [post] = (await http().get('/api/blog-posts').expect(200)).body
        .data;

      expect(post.excerpt).toBe('Autumn menu Try our borscht.');
      expect(Object.keys(post).sort()).toEqual([
        'categories',
        'excerpt',
        'id',
        'image',
        'publishedAt',
        'slug',
        'title',
      ]);
    });

    it.each(['pageSize=101', 'page=0', `category=${'x'.repeat(101)}`])(
      'rejects ?%s with a 400 in the error shape',
      async (query) => {
        const res = await http().get(`/api/blog-posts?${query}`).expect(400);

        expect(res.body.error).toMatchObject({
          code: 'BAD_REQUEST',
          message: 'Validation failed',
        });
      },
    );
  });

  describe('GET /api/blog-posts/:slug', () => {
    it('returns the full post with its image, categories and SEO', async () => {
      const image = await createMedia(dataSource, { alt: 'Borscht' });
      const news = await createBlogCategory(dataSource, {
        name: 'News',
        slug: 'news',
      });
      const post = await createBlogPost(dataSource, {
        slug: 'autumn-menu',
        title: 'Autumn menu',
        text: '## New dishes\n\nTry our **borscht**.',
        image,
        categories: [news],
        seo: { title: 'Autumn menu', description: 'New dishes' },
      });

      const res = await http().get('/api/blog-posts/autumn-menu').expect(200);

      expect(res.body.data).toEqual({
        id: post.id,
        slug: 'autumn-menu',
        title: 'Autumn menu',
        excerpt: 'New dishes Try our borscht.',
        text: '## New dishes\n\nTry our **borscht**.',
        image: expect.objectContaining({ id: image.id, alt: 'Borscht' }),
        categories: [{ id: news.id, name: 'News', slug: 'news' }],
        seo: {
          title: 'Autumn menu',
          description: 'New dishes',
          shareImage: null,
        },
        publishedAt: post.publishedAt?.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
      });
    });

    it.each([
      ['an unknown', 'nope', undefined],
      ['a draft', 'draft', null],
      ['a scheduled', 'scheduled', daysFromNow(1)],
    ])(
      'returns the same 404 for %s post (no hint that it exists)',
      async (_label, slug, publishedAt) => {
        if (publishedAt !== undefined) {
          await createBlogPost(dataSource, { slug, publishedAt });
        }

        const res = await http().get(`/api/blog-posts/${slug}`).expect(404);

        expect(res.body).toEqual({
          error: {
            status: 404,
            code: 'NOT_FOUND',
            message: 'Blog post not found',
            requestId: expect.any(String),
          },
        });
      },
    );

    it('shows a scheduled post once its publish date has passed', async () => {
      const post = await createBlogPost(dataSource, {
        slug: 'soon',
        publishedAt: daysFromNow(1),
      });
      await http().get('/api/blog-posts/soon').expect(404);

      await dataSource
        .getRepository(BlogPost)
        .update({ id: post.id }, { publishedAt: daysFromNow(-1) });

      await http().get('/api/blog-posts/soon').expect(200);
      const list = await http().get('/api/blog-posts').expect(200);
      expect(slugs(list.body)).toEqual(['soon']);
    });

    it('returns the SEO share image', async () => {
      const shareImage = await createMedia(dataSource);
      await createBlogPost(dataSource, {
        slug: 'shared',
        seo: { title: null, description: null, shareImage },
      });

      const res = await http().get('/api/blog-posts/shared').expect(200);

      expect(res.body.data.seo.shareImage).toMatchObject({ id: shareImage.id });
    });

    it('keeps the post when its image file is deleted (ON DELETE SET NULL)', async () => {
      const image = await createMedia(dataSource);
      await createBlogPost(dataSource, { slug: 'kept', image });

      await dataSource.getRepository(Media).delete({ id: image.id });

      const res = await http().get('/api/blog-posts/kept').expect(200);
      expect(res.body.data.image).toBeNull();
    });

    it('keeps the post when one of its categories is deleted', async () => {
      const news = await createBlogCategory(dataSource, { slug: 'news' });
      const events = await createBlogCategory(dataSource, { slug: 'events' });
      await createBlogPost(dataSource, {
        slug: 'kept',
        categories: [news, events],
      });

      await dataSource.getRepository(BlogCategory).delete({ id: news.id });

      const res = await http().get('/api/blog-posts/kept').expect(200);
      expect(
        res.body.data.categories.map((c: { slug: string }) => c.slug),
      ).toEqual(['events']);
    });
  });

  describe('GET /api/blog-categories', () => {
    it('returns all categories by name, with id, name and slug only', async () => {
      await createBlogCategory(dataSource, { name: 'Recipes' });
      await createBlogCategory(dataSource, { name: 'Events' });
      await createBlogCategory(dataSource, { name: 'News' });

      const res = await http().get('/api/blog-categories').expect(200);

      expect(res.body.data.map((c: { name: string }) => c.name)).toEqual([
        'Events',
        'News',
        'Recipes',
      ]);
      expect(Object.keys(res.body.data[0]).sort()).toEqual([
        'id',
        'name',
        'slug',
      ]);
    });
  });

  describe('database constraints', () => {
    it('rejects a duplicate post slug by its constraint name', async () => {
      await createBlogPost(dataSource, { slug: 'twin' });

      await expect(
        createBlogPost(dataSource, { slug: 'twin' }),
      ).rejects.toThrow('UQ_blog_post_slug');
    });

    it('rejects a duplicate category slug by its constraint name', async () => {
      await createBlogCategory(dataSource, { slug: 'twin' });

      await expect(
        createBlogCategory(dataSource, { slug: 'twin' }),
      ).rejects.toThrow('UQ_blog_category_slug');
    });
  });

  describe('Swagger', () => {
    // The project's real document config (operation IDs, tags, global errors).
    const document = () =>
      SwaggerModule.createDocument(app, buildSwaggerDocumentConfig(), {
        operationIdFactory,
      });
    const okSchema = (operation?: { responses: Record<string, unknown> }) => {
      const ok = operation?.responses['200'] as
        | { content: Record<string, { schema: { properties: unknown } }> }
        | undefined;
      return ok?.content['application/json'].schema.properties;
    };

    it('uses short operation IDs and the blog tag', () => {
      const paths = document().paths;

      expect(paths['/api/blog-posts'].get).toMatchObject({
        operationId: 'BlogPosts_findAll',
        tags: ['blog'],
      });
      expect(paths['/api/blog-posts/{slug}'].get).toMatchObject({
        operationId: 'BlogPosts_findBySlug',
        tags: ['blog'],
      });
      expect(paths['/api/blog-categories'].get).toMatchObject({
        operationId: 'BlogCategories_findAll',
        tags: ['blog'],
      });
    });

    it('documents the list as summaries and the detail as the full post', () => {
      const paths = document().paths;

      expect(okSchema(paths['/api/blog-posts'].get)).toEqual({
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/BlogPostSummaryDto' },
        },
        meta: { $ref: '#/components/schemas/PaginationMetaDto' },
      });
      expect(okSchema(paths['/api/blog-posts/{slug}'].get)).toEqual({
        data: { $ref: '#/components/schemas/BlogPostDto' },
      });
    });

    it('documents the 404 of /blog-posts/{slug} with the error shape', () => {
      expect(
        document().paths['/api/blog-posts/{slug}'].get?.responses['404'],
      ).toMatchObject({
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponseDto' },
          },
        },
      });
    });

    // Only `image` has an explicit @ApiProperty: the CLI plugin that documents
    // the other fields doesn't run under Jest.
    it('documents image as a nullable MediaDto, inherited by BlogPostDto', () => {
      const schemas = document().components?.schemas as Record<
        string,
        { properties: Record<string, unknown> }
      >;

      for (const name of ['BlogPostSummaryDto', 'BlogPostDto']) {
        expect(schemas[name].properties.image).toMatchObject({
          nullable: true,
          allOf: [{ $ref: '#/components/schemas/MediaDto' }],
        });
      }
    });
  });
});
