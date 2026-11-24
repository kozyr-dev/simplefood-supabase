import type { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { mkdtemp, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Product } from '@/catalog/entities/product.entity';
import { InvalidSectionDataError } from '@/content/entities/section-data';
import { Media } from '@/media/entities/media.entity';
import { Order } from '@/orders/entities/order.entity';
import {
  ImportCheckError,
  importStrapi,
  type ImportOptions,
} from '@/strapi-import/services/import-strapi';
import { StrapiImporter } from '@/strapi-import/services/strapi-importer';
import { User } from '@/users/entities/user.entity';
import { bearer } from './utils/auth';
import { resetDatabase } from './utils/database';
import { emptyUploads, storedFiles, uploadsDir } from './utils/images';
import { StrapiFixture } from './utils/strapi-fixture';
import { createTestApp } from './utils/test-app';
import { resetRateLimits } from './utils/throttler';

const PASSWORD = 'strapi password 1';

/**
 * A small Strapi site with every section type, drafts next to published
 * rows, and the leftovers found in the real data (Strapi 4 `Image` links,
 * a stale `MenuListItem` field, file names as alt texts).
 */
async function seed(f: StrapiFixture) {
  const folder = f.insert('upload_folders', { name: 'Products' });
  const photo = await f.file('borscht.jpg', {
    sizes: ['thumbnail', 'small', 'medium', 'large'],
    folderId: folder,
  });
  const oldPhoto = await f.file('old-v4.jpg');
  const icon = await f.file('icon.jpg', { alt: 'Іконка доставки' });
  const banner = await f.file('banner.jpg', { alt: null });
  const gallery = [await f.file('g1.jpg'), await f.file('g2.jpg')];

  // Catalog: links and media on both rows, as Strapi keeps them.
  const soups = f.document('product_categories', {
    name: 'Супи',
    slug: 'soups',
  });
  const drinks = f.document('product_categories', {
    name: 'Напої',
    slug: 'drinks',
  });
  const borscht = f.document(
    'products',
    {
      slug: 'borscht',
      title: 'Борщ',
      description: '**Смачний**',
      weight: 350,
      callories: 0,
      available: 1,
      featured: 1,
      favorite: 0,
      price: 89.5,
    },
    { draft: { title: 'Борщ (чернетка)' } },
  );
  const compote = f.document('products', {
    slug: 'compote',
    title: 'Компот',
    weight: 0,
    callories: null,
    available: 1,
    featured: 0,
    favorite: 1,
    price: 19.99,
  });
  for (const key of ['draft', 'published'] as const) {
    f.insert('products_product_categories_lnk', {
      product_id: borscht[key],
      product_category_id: soups[key],
    });
    f.insert('products_product_categories_lnk', {
      product_id: compote[key],
      product_category_id: drinks[key],
    });
    f.media('api::product.product', 'image', borscht[key], [photo]);
  }
  f.media('api::product.product', 'Image', compote.published, [oldPhoto]);

  // Blog, with SEO; an unpublished post stays out.
  const news = f.document('blog_categories', { name: 'News', slug: 'news' });
  const post = f.document(
    'blog_posts',
    { title: 'Новий сайт', text: 'Ми **відкрилися**', slug: 'novyj-sait' },
    { createdAt: Date.UTC(2022, 10, 14) },
  );
  f.insert('blog_posts_blog_categories_lnk', {
    blog_post_id: post.published,
    blog_category_id: news.published,
  });
  f.media('api::blog-post.blog-post', 'Image', post.published, [banner]);
  f.attach(
    'blog_posts',
    post.published,
    'SEO',
    'seo.seo-title',
    f.insert('components_seo_seo_titles', {
      seo_title: 'Новий сайт',
      seo_description: 'Про відкриття',
    }),
  );
  f.insert('blog_posts', {
    title: 'Чернетка',
    text: 'x',
    slug: 'draft-only',
    document_id: 'unpublished',
    created_at: Date.UTC(2024, 0, 1),
    updated_at: Date.UTC(2024, 0, 1),
    published_at: null,
  });

  // Settings and menus.
  const options = f.document('site_options', {
    site_name: 'Simple Food',
    phone: '+380 67 000 00 00',
    address: 'Київ',
    working_hours: '9–21',
    taking_orders_hours: '9–20',
    facebook: 'https://facebook.com/simplefood',
    instagram: '',
  });
  f.attach(
    'site_options',
    options.published,
    'SEO',
    'seo.seo-title',
    f.insert('components_seo_seo_titles', { seo_title: 'Simple Food' }),
  );
  const header = f.document('header_menus', {});
  f.attach(
    'header_menus',
    header.published,
    'menuItem',
    'ui.menu',
    f.insert('components_ui_menus', {
      title: 'Супи',
      link: '/menu#soup',
      classname: '',
    }),
  );
  const footer = f.document('footer_menus', {});
  f.attach(
    'footer_menus',
    footer.published,
    'footerMenu',
    'ui.menu',
    f.insert('components_ui_menus', { title: 'Про нас', link: '/about-us' }),
  );
  const dropdown = f.document('dropdown_menus', {});
  f.attach(
    'dropdown_menus',
    dropdown.published,
    'menuItem',
    'ui.menu',
    f.insert('components_ui_menus', {
      title: 'Меню',
      link: '/menu',
      classname: 'highlight1',
    }),
  );
  for (const [order, title] of ['Кабінет', 'Акції'].entries()) {
    f.attach(
      'dropdown_menus',
      dropdown.published,
      'menuListItem',
      'ui.menu-list',
      f.insert('components_ui_menu_lists', {
        title,
        link: `/${order}`,
        classname: 'menu_img img_about',
      }),
      order + 1,
    );
  }
  f.attach(
    'dropdown_menus',
    dropdown.published,
    'MenuListItem',
    'ui.menu-list',
    f.insert('components_ui_menu_lists', { title: 'Stale', link: '/promo' }),
  );

  // The homepage, one section of each kind it uses, in order.
  const home = f.document('homepages', { title: 'Home', slug: 'home' });
  const section = (
    type: string,
    table: string,
    values: object,
    order: number,
  ) => {
    const id = f.insert(table, values as never);
    f.attach('homepages', home.published, 'Body', type, id, order);
    return id;
  };
  const button = (owner: string, id: number, text = 'Замовити') =>
    f.attach(
      owner,
      id,
      'button',
      'ui.button',
      f.insert('components_ui_buttons', { text, url: '/menu' }),
    );

  const bannerId = section(
    'sections.image-banner',
    'components_sections_image_banners',
    { title: 'Смачно', text: 'Щодня', background_color: '#0D0B0C' },
    1,
  );
  button('components_sections_image_banners', bannerId);
  f.media('sections.image-banner', 'image', bannerId, [banner]);

  const benefitsId = section(
    'sections.benefits',
    'components_sections_benefits',
    { title: 'Чому ми' },
    2,
  );
  for (const [order, title] of ['Швидко', 'Свіжо'].entries()) {
    const benefit = f.insert('components_ui_benefits', { title, text: 'Так' });
    f.attach(
      'components_sections_benefits',
      benefitsId,
      'Benefit',
      'ui.benefit',
      benefit,
      order + 1,
    );
    f.media('ui.benefit', 'icon', benefit, [icon]);
  }

  const selectedId = section(
    'sections.products',
    'components_sections_products',
    { title: 'Хіти', source: 'Selected', layout: 'Slider' },
    3,
  );
  for (const product of [compote, borscht]) {
    f.insert('components_sections_products_products_lnk', {
      products_id: selectedId,
      product_id: product.published,
    });
  }

  const promoId = section(
    'sections.promo-block',
    'components_sections_promo_blocks',
    { title: 'Акція', text: '-20%', invert_layout: 1 },
    4,
  );
  button('components_sections_promo_blocks', promoId);
  f.media('sections.promo-block', 'icon', promoId, [icon]);
  f.media('sections.promo-block', 'image', promoId, [banner]);

  const articlesId = section(
    'sections.articles',
    'components_sections_articles',
    { title: 'Доставка', custom_id: 'delivery', custom_class: null },
    5,
  );
  const article = f.insert('components_ui_articles', {
    title: 'Як',
    text: '**Швидко**',
  });
  f.attach(
    'components_sections_articles',
    articlesId,
    'article',
    'ui.article',
    article,
  );
  f.media('ui.article', 'icon', article, [icon]);

  const videoId = section(
    'sections.video-block',
    'components_sections_video_blocks',
    {
      title: 'Відео',
      description: 'Про нас',
      embed_video_url: 'https://www.youtube.com/embed/abc',
    },
    6,
  );
  f.media('sections.video-block', 'placeholder_image', videoId, [banner]);

  const galleryId = section(
    'sections.image-gallery',
    'components_sections_image_galleries',
    { title: 'Галерея' },
    7,
  );
  f.media('sections.image-gallery', 'images', galleryId, [
    gallery[1],
    gallery[0],
  ]);

  const newsId = section(
    'sections.news-section',
    'components_sections_news_sections',
    { title: 'Новини', layout: 'slider' },
    8,
  );
  f.insert('components_sections_news_sections_blog_category_lnk', {
    news_section_id: newsId,
    blog_category_id: news.published,
  });

  // A page with the remaining kinds; an unpublished page stays out.
  const contact = f.document('pages', { title: 'Контакти', slug: 'contact' });
  f.attach(
    'pages',
    contact.published,
    'SEO',
    'seo.seo-title',
    f.insert('components_seo_seo_titles', { seo_description: 'Як нас знайти' }),
  );
  const page = (type: string, table: string, values: object, order: number) => {
    const id = f.insert(table, values as never);
    f.attach('pages', contact.published, 'body', type, id, order);
    return id;
  };
  page(
    'sections.contact',
    'components_sections_contacts',
    {
      title: 'Пишіть',
      content: 'Телефон',
      content_2: 'Адреса',
      map_embed_code: '<iframe src="https://maps.example"></iframe>',
      form: 1,
      form_title: 'Форма',
    },
    1,
  );
  const contentId = page(
    'sections.content',
    'components_sections_contents',
    { title: 'Про нас', content: 'Текст', embed_code: null },
    2,
  );
  f.media('sections.content', 'image', contentId, [banner]);
  const categoryId = page(
    'sections.products',
    'components_sections_products',
    { title: 'Супи', source: 'Category', layout: 'Grid', custom_id: 'soup' },
    3,
  );
  f.insert('components_sections_products_product_category_lnk', {
    products_id: categoryId,
    product_category_id: soups.published,
  });
  f.insert('pages', {
    title: 'Secret',
    slug: 'secret',
    document_id: 'unpublished-page',
    published_at: null,
  });

  // Customers, orders (placed out of id order), a contact message.
  const role = f.insert('up_roles', { type: 'authenticated' });
  const hash = (await bcrypt.hash(PASSWORD, 10)).replace(/^\$2b\$/, '$2a$');
  const ivan = f.insert('up_users', {
    username: 'Ivan',
    email: 'ivan@example.com',
    provider: 'local',
    password: hash,
    confirmed: 1,
    blocked: 0,
    phone: '+380 67 123 45 67',
    address: '',
    created_at: Date.UTC(2023, 0, 1),
    updated_at: Date.UTC(2023, 0, 1),
  });
  f.insert('up_users_role_lnk', { user_id: ivan, role_id: role });
  const later = f.document(
    'orders',
    {
      address: 'Київ',
      name: 'Іван',
      phone: '+380671234567',
      dishes: 'Борщ x2',
      amount: 179,
      email: 'ivan@example.com',
      status: 'new',
    },
    { createdAt: Date.UTC(2024, 5, 2) },
  );
  const earlier = f.document(
    'orders',
    {
      address: 'Львів',
      name: 'Іван',
      phone: '+380671234567',
      dishes: 'Компот',
      amount: 75,
      email: 'ivan@example.com',
      status: 'completed',
    },
    { createdAt: Date.UTC(2024, 5, 1) },
  );
  for (const order of [later, earlier]) {
    f.insert('orders_users_permissions_user_lnk', {
      order_id: order.published,
      user_id: ivan,
    });
  }
  f.document('contact_submissions', {
    name: 'Олена',
    email: 'olena@example.com',
    message: 'Чи є доставка?',
  });

  return { photo, icon, banner, gallery };
}

describe('Strapi import (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let dir: string;
  let fixture: StrapiFixture;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
    await emptyUploads(app);
    resetRateLimits(app);
    dir = await mkdtemp(join(tmpdir(), 'simplefood-strapi-'));
    fixture = await StrapiFixture.create(dir);
  });

  afterEach(async () => {
    fixture.close();
    await rm(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  const http = () => request(app.getHttpServer());
  const options = (overrides: Partial<ImportOptions> = {}): ImportOptions => ({
    sqlitePath: fixture.sqlitePath,
    uploadsSource: fixture.uploadsDir,
    uploadsTarget: uploadsDir(app),
    replace: false,
    dryRun: false,
    ...overrides,
  });
  const run = (overrides?: Partial<ImportOptions>) =>
    importStrapi(dataSource, options(overrides));
  const count = (entity: new () => object) =>
    dataSource.getRepository(entity).count();

  /** The rows of every imported table, for "nothing changed" checks. */
  const totals = async () =>
    Object.fromEntries(
      await Promise.all(
        [
          'media',
          'product',
          'page',
          'page_section',
          'app_user',
          'customer_order',
        ].map(async (table) => {
          const [{ n }] = (await dataSource.query(
            `SELECT count(*)::int AS n FROM "${table}"`,
          )) as { n: number }[];
          return [table, n];
        }),
      ),
    );

  it('imports the published content, reports it, and copies the files', async () => {
    await seed(fixture);

    const report = await run();

    expect(report).toMatchObject({
      counts: {
        media: 6,
        productCategories: 2,
        products: 2,
        blogCategories: 1,
        blogPosts: 1,
        siteSettings: 1,
        'menu.header': 1,
        'menu.footer': 1,
        'menu.dropdown': 3,
        pages: 2,
        pageSections: 11,
        users: 1,
        orders: 2,
        contactSubmissions: 1,
      },
      warnings: ['1 product(s) have no image'],
      dryRun: false,
      filesCopied: 10,
      filesUnchanged: 0,
    });
    expect(await storedFiles(app)).toEqual(report.files);
  });

  it('keeps products, prices and links as Strapi published them', async () => {
    await seed(fixture);
    await run();

    const products = await dataSource.getRepository(Product).find({
      relations: { categories: true, image: true },
      order: { slug: 'ASC' },
    });
    expect(
      products.map(
        ({ slug, title, price, weight, calories, image, categories }) => ({
          slug,
          title,
          price,
          weight,
          calories,
          image: image?.name ?? null,
          categories: categories.map((category) => category.slug),
        }),
      ),
    ).toEqual([
      {
        slug: 'borscht',
        title: 'Борщ', // the published row, not the draft
        price: 8950,
        weight: 350,
        calories: 0,
        image: 'borscht.jpg',
        categories: ['soups'],
      },
      {
        slug: 'compote',
        title: 'Компот',
        price: 1999,
        weight: null, // 0 isn't a weight
        calories: null,
        image: null, // its only link is a Strapi 4 leftover
        categories: ['drinks'],
      },
    ]);
  });

  it('keeps the files as they are, without file names as alt text', async () => {
    const { photo } = await seed(fixture);
    await run();

    const media = await dataSource
      .getRepository(Media)
      .find({ order: { name: 'ASC' } });
    const borscht = media.find((item) => item.name === 'borscht.jpg');
    expect(borscht).toMatchObject({
      alt: null,
      folder: 'products',
      mime: 'image/jpeg',
      size: 123392,
      width: 1200,
      height: 800,
    });
    expect(Object.keys(borscht?.formats ?? {}).sort()).toEqual([
      'large',
      'medium',
      'small',
      'thumbnail',
    ]);
    expect(media.find((item) => item.name === 'icon.jpg')?.alt).toBe(
      'Іконка доставки',
    );
    expect(photo).toBeGreaterThan(0);

    for (const url of [borscht?.url, borscht?.formats?.small?.url]) {
      await http()
        .get(String(url))
        .expect(200)
        .expect('content-type', 'image/jpeg');
    }
  });

  it('serves the pages through the API, sections in order, links resolved', async () => {
    await seed(fixture);
    await run();

    const home = (await http().get('/api/pages/home').expect(200)).body.data;
    expect(home.sections.map((s: { type: string }) => s.type)).toEqual([
      'image-banner',
      'benefits',
      'products',
      'promo',
      'articles',
      'video',
      'image-gallery',
      'news',
    ]);
    const [banner, benefits, selected, promo, articles, video, gallery, news] =
      home.sections;
    expect(banner).toMatchObject({
      title: 'Смачно',
      backgroundColor: '#0D0B0C',
      button: { text: 'Замовити', url: '/menu' },
      image: { url: expect.stringMatching(/^\/uploads\/banner/) },
    });
    expect(benefits.items).toEqual([
      expect.objectContaining({ title: 'Швидко', icon: expect.any(Object) }),
      expect.objectContaining({ title: 'Свіжо', icon: expect.any(Object) }),
    ]);
    // The editor's order, not the catalog's.
    expect(selected.products.map((p: { slug: string }) => p.slug)).toEqual([
      'compote',
      'borscht',
    ]);
    expect(promo).toMatchObject({
      invertLayout: true,
      icon: expect.any(Object),
    });
    expect(articles).toMatchObject({ anchorId: 'delivery' });
    expect(video).toMatchObject({
      videoUrl: 'https://www.youtube.com/embed/abc',
      placeholderImage: expect.any(Object),
    });
    expect(gallery.images.map((image: { url: string }) => image.url)).toEqual([
      expect.stringMatching(/^\/uploads\/g2/),
      expect.stringMatching(/^\/uploads\/g1/),
    ]);
    expect(news).toMatchObject({
      layout: 'slider',
      blogCategory: { slug: 'news' },
    });

    const contact = (await http().get('/api/pages/contact').expect(200)).body
      .data;
    expect(contact.seo).toMatchObject({
      title: null,
      description: 'Як нас знайти',
    });
    expect(contact.sections).toEqual([
      expect.objectContaining({
        type: 'contact',
        secondaryContent: 'Адреса',
        showForm: true,
      }),
      expect.objectContaining({ type: 'content', image: expect.any(Object) }),
      expect.objectContaining({
        type: 'products',
        anchorId: 'soup',
        layout: 'grid',
        products: [expect.objectContaining({ slug: 'borscht' })],
      }),
    ]);
    await http().get('/api/pages/secret').expect(404);
  });

  it('imports the blog, settings and menus; leaves out drafts and stale fields', async () => {
    await seed(fixture);
    await run();

    const posts = (await http().get('/api/blog-posts').expect(200)).body.data;
    expect(posts).toEqual([
      expect.objectContaining({
        slug: 'novyj-sait',
        publishedAt: '2022-11-14T00:00:01.000Z',
      }),
    ]);
    const settings = (await http().get('/api/settings').expect(200)).body.data;
    expect(settings).toMatchObject({
      siteName: 'Simple Food',
      instagram: null,
      seo: { title: 'Simple Food', description: null },
    });
    const dropdown = (await http().get('/api/menus/dropdown').expect(200)).body
      .data;
    expect(JSON.stringify(dropdown)).not.toContain('Stale');
    expect(JSON.stringify(dropdown)).toContain('Кабінет');
  });

  it('keeps the Strapi password hashes working, but not as verified emails', async () => {
    await seed(fixture);
    await run();

    const res = await http()
      .post('/api/auth/login')
      .send({ email: 'ivan@example.com', password: PASSWORD })
      .expect(200);

    expect(res.body.data.user).toMatchObject({
      name: 'Ivan',
      emailVerified: false,
      phone: '+380 67 123 45 67',
      address: null,
      role: 'customer',
    });
    const user = await dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .getOneOrFail();
    // Strapi's own hash (rehashed at login only when it's weaker than
    // BCRYPT_ROUNDS: 4 here, 12 in production; see the auth tests).
    expect(user.passwordHash).toMatch(/^\$2a\$10\$/);
    expect(user.createdAt.toISOString()).toBe('2023-01-01T00:00:00.000Z');
  });

  it('numbers orders by date, keeps their dish text, and shows them to their customer', async () => {
    await seed(fixture);
    await run();

    const orders = await dataSource
      .getRepository(Order)
      .find({ order: { number: 'ASC' } });
    expect(
      orders.map(
        ({ number, subtotal, status, legacyDishesText, shippingMethod }) => ({
          number,
          subtotal,
          status,
          legacyDishesText,
          shippingMethod,
        }),
      ),
    ).toEqual([
      {
        number: 1,
        subtotal: 7500,
        status: 'completed',
        legacyDishesText: 'Компот',
        shippingMethod: 'delivery',
      },
      {
        number: 2,
        subtotal: 17900,
        status: 'new',
        legacyDishesText: 'Борщ x2',
        shippingMethod: 'delivery',
      },
    ]);

    const login = await http()
      .post('/api/auth/login')
      .send({ email: 'ivan@example.com', password: PASSWORD })
      .expect(200);
    const mine = await http()
      .get('/api/orders/me')
      .set(bearer(login.body.data.accessToken))
      .expect(200);
    expect(mine.body.data.map((o: { number: number }) => o.number)).toEqual([
      2, 1,
    ]);
  });

  describe('safety', () => {
    it('refuses a database that has data, changing nothing; --replace starts over', async () => {
      await seed(fixture);
      const first = await run();
      const before = await totals();

      await expect(run()).rejects.toThrow(/already have data: .*media/);
      expect(await totals()).toEqual(before);

      const again = await run({ replace: true });
      expect(await totals()).toEqual(before);
      expect(again).toMatchObject({
        counts: first.counts,
        filesCopied: 0,
        filesUnchanged: first.files.length,
      });
      // Numbered from 1 again.
      const numbers = (await dataSource.getRepository(Order).find()).map(
        (order) => order.number,
      );
      expect(numbers.sort((a, b) => a - b)).toEqual([1, 2]);
    });

    it('a dry run saves nothing and copies nothing', async () => {
      await seed(fixture);

      const report = await run({ dryRun: true });

      expect(report).toMatchObject({ dryRun: true, filesCopied: 0 });
      expect(report.counts.products).toBe(2);
      expect(await count(Product)).toBe(0);
      expect(await storedFiles(app)).toEqual([]);
    });

    it('stops before saving anything when a file is missing', async () => {
      await seed(fixture);
      const [first] = await readdir(fixture.uploadsDir);
      await unlink(join(fixture.uploadsDir, first));

      await expect(run()).rejects.toThrow(/1 file\(s\) missing/);
      expect(await count(Media)).toBe(0);
      expect(await storedFiles(app)).toEqual([]);
    });

    it('stops when a different file already has a name', async () => {
      await seed(fixture);
      const { files } = await run({ dryRun: true });
      await writeFile(join(uploadsDir(app), files[0]), 'something else');

      await expect(run()).rejects.toThrow(
        /already exists .* with other content/,
      );
      expect(await count(Media)).toBe(0);
    });

    it('compares the result with Strapi, and saves nothing when they differ', async () => {
      await seed(fixture);
      // An importer bug: the contact messages are skipped.
      jest
        .spyOn(
          StrapiImporter.prototype as unknown as {
            importContacts(): Promise<void>;
          },
          'importContacts',
        )
        .mockResolvedValue(undefined);

      const error: unknown = await run().catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ImportCheckError);
      expect((error as ImportCheckError).problems).toEqual([
        'contact messages: 0 imported, 1 in Strapi',
      ]);
      expect(await count(Product)).toBe(0);
      expect(await storedFiles(app)).toEqual([]);
    });

    it('rolls everything back when a section breaks our rules', async () => {
      await seed(fixture);
      fixture.db
        .prepare(
          'UPDATE components_sections_image_banners SET background_color = ?',
        )
        .run('red');

      await expect(run()).rejects.toBeInstanceOf(InvalidSectionDataError);
      expect(await totals()).toEqual({
        media: 0,
        product: 0,
        page: 0,
        page_section: 0,
        app_user: 0,
        customer_order: 0,
      });
    });
  });
});
