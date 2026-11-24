import { BlogCategory } from '../entities/blog-category.entity';
import { BlogPost } from '../entities/blog-post.entity';
import { Media } from '@/media/entities/media.entity';
import {
  toBlogCategoryDto,
  toBlogPostDto,
  toBlogPostSummaryDto,
} from './blog.mappers';

const category = (name: string) =>
  Object.assign(new BlogCategory(), {
    id: `id-${name}`,
    name,
    slug: name.toLowerCase(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const image = Object.assign(new Media(), {
  id: 'media-1',
  url: '/uploads/borscht.jpg',
  mime: 'image/jpeg',
  size: 1000,
  width: 800,
  height: 600,
  alt: 'Borscht',
  folder: 'blog',
  formats: null,
});

const publishedAt = new Date('2026-10-01T10:00:00Z');
const updatedAt = new Date('2026-10-02T10:00:00Z');

function post(overrides: Partial<BlogPost> = {}): BlogPost {
  return Object.assign(new BlogPost(), {
    id: 'post-1',
    createdAt: new Date('2026-09-30T10:00:00Z'),
    updatedAt,
    slug: 'autumn-menu',
    title: 'Autumn menu',
    text: '## New dishes\n\nTry our **borscht** and [soups](/soups).',
    image,
    seo: { title: 'Autumn menu', description: null },
    publishedAt,
    categories: [category('News')],
    ...overrides,
  });
}

describe('toBlogCategoryDto', () => {
  it('returns id, name and slug only', () => {
    expect(toBlogCategoryDto(category('Events'))).toEqual({
      id: 'id-Events',
      name: 'Events',
      slug: 'events',
    });
  });
});

describe('toBlogPostSummaryDto', () => {
  it('returns the list fields with a plain-text excerpt', () => {
    expect(toBlogPostSummaryDto(post())).toEqual({
      id: 'post-1',
      slug: 'autumn-menu',
      title: 'Autumn menu',
      excerpt: 'New dishes Try our borscht and soups.',
      image: {
        id: 'media-1',
        url: '/uploads/borscht.jpg',
        alt: 'Borscht',
        width: 800,
        height: 600,
        formats: null,
      },
      publishedAt,
      categories: [{ id: 'id-News', name: 'News', slug: 'news' }],
    });
  });

  it('leaves out the full text, SEO and timestamps', () => {
    const dto = toBlogPostSummaryDto(post());

    for (const key of ['text', 'seo', 'createdAt', 'updatedAt']) {
      expect(dto).not.toHaveProperty(key);
    }
  });

  it('returns image: null for a post without a photo', () => {
    expect(toBlogPostSummaryDto(post({ image: null })).image).toBeNull();
  });

  it('sorts categories by name', () => {
    const dto = toBlogPostSummaryDto(
      post({ categories: [category('News'), category('Events')] }),
    );

    expect(dto.categories.map((c) => c.name)).toEqual(['Events', 'News']);
  });

  it('copes with categories that were not loaded', () => {
    const unloaded = post();
    delete (unloaded as Partial<BlogPost>).categories;

    expect(toBlogPostSummaryDto(unloaded).categories).toEqual([]);
  });

  it('refuses an unpublished post (a public query that forgot the filter)', () => {
    expect(() => toBlogPostSummaryDto(post({ publishedAt: null }))).toThrow(
      /not published/,
    );
  });
});

describe('toBlogPostDto', () => {
  it('adds the full markdown, SEO and updatedAt to the summary', () => {
    const dto = toBlogPostDto(post());

    expect(dto).toMatchObject({
      slug: 'autumn-menu',
      excerpt: 'New dishes Try our borscht and soups.',
      text: '## New dishes\n\nTry our **borscht** and [soups](/soups).',
      seo: { title: 'Autumn menu', description: null },
      updatedAt,
    });
  });

  it('returns null SEO fields when the post has none', () => {
    const dto = toBlogPostDto(post({ seo: undefined }));

    expect(dto.seo).toEqual({
      title: null,
      description: null,
      shareImage: null,
    });
  });
});
