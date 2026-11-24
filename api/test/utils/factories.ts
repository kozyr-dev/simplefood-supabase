import bcrypt from 'bcrypt';
import type { DataSource } from 'typeorm';
import { BlogCategory } from '@/blog/entities/blog-category.entity';
import { BlogPost } from '@/blog/entities/blog-post.entity';
import { ProductCategory } from '@/catalog/entities/product-category.entity';
import { Product } from '@/catalog/entities/product.entity';
import { MenuItem, MenuItemGroup } from '@/content/entities/menu-item.entity';
import { Menu, type MenuKey } from '@/content/entities/menu.entity';
import {
  PageSection,
  type SectionType,
} from '@/content/entities/page-section.entity';
import { Page } from '@/content/entities/page.entity';
import { validateSectionData } from '@/content/entities/section-data';
import { SiteSettings } from '@/content/entities/site-settings.entity';
import { Media } from '@/media/entities/media.entity';
import { OrderItem } from '@/orders/entities/order-item.entity';
import { Order, ShippingMethod } from '@/orders/entities/order.entity';
import { User } from '@/users/entities/user.entity';

/*
 * Test data factories: save a valid row with sensible defaults, so each test
 * only spells out what it's about: `createMedia(ds, { width: null })`.
 * Values that must be unique get a counter, so repeated calls never collide.
 * Add one factory per entity as entities arrive (createProduct, ...).
 */

let sequence = 0;
const next = () => ++sequence;

export function createMedia(
  dataSource: DataSource,
  overrides: Partial<Media> = {},
): Promise<Media> {
  const n = next();
  const repository = dataSource.getRepository(Media);
  return repository.save(
    repository.create({
      url: `/uploads/test-${n}.jpg`,
      name: `test-${n}.jpg`,
      mime: 'image/jpeg',
      size: 1024,
      width: 800,
      height: 600,
      alt: `Test image ${n}`,
      ...overrides,
    }),
  );
}

export function createCategory(
  dataSource: DataSource,
  overrides: Partial<ProductCategory> = {},
): Promise<ProductCategory> {
  const n = next();
  const repository = dataSource.getRepository(ProductCategory);
  return repository.save(
    repository.create({
      name: `Category ${n}`,
      slug: `category-${n}`,
      position: 0,
      ...overrides,
    }),
  );
}

/** E.g. `createProduct(ds, { categories: [pizza], image, price: 18900 })`. */
export function createProduct(
  dataSource: DataSource,
  overrides: Partial<Product> = {},
): Promise<Product> {
  const n = next();
  const repository = dataSource.getRepository(Product);
  return repository.save(
    repository.create({
      slug: `product-${n}`,
      title: `Product ${n}`,
      description: `<p>Description ${n}</p>`,
      price: 10000,
      weight: 300,
      calories: 400,
      categories: [],
      image: null,
      ...overrides,
    }),
  );
}

/** The single settings row (id 1). */
export function createSettings(
  dataSource: DataSource,
  overrides: Partial<SiteSettings> = {},
): Promise<SiteSettings> {
  const repository = dataSource.getRepository(SiteSettings);
  return repository.save(
    repository.create({
      siteName: 'SimpleFood',
      phone: '+380 44 123 45 67',
      address: 'Kyiv, Khreshchatyk St, 1',
      workingHours: 'Mon–Sun 10:00–22:00',
      takingOrdersHours: 'until 21:30',
      facebook: 'https://facebook.com/simplefood',
      instagram: 'https://instagram.com/simplefood',
      seo: { title: 'SimpleFood', description: 'Home-style food delivery' },
      ...overrides,
    }),
  );
}

/** E.g. `createMenu(ds, MenuKey.Header, [{ title: 'Home', position: 1 }])`. */
export async function createMenu(
  dataSource: DataSource,
  key: MenuKey,
  items: Partial<MenuItem>[] = [],
): Promise<Menu> {
  const menu = await dataSource.getRepository(Menu).save({ key });
  const itemRepository = dataSource.getRepository(MenuItem);
  menu.items = await itemRepository.save(
    items.map((item) => {
      const n = next();
      return itemRepository.create({
        title: `Item ${n}`,
        link: `/item-${n}`,
        className: null,
        group: MenuItemGroup.Main,
        position: 0,
        ...item,
        menu,
      });
    }),
  );
  return menu;
}

export function createBlogCategory(
  dataSource: DataSource,
  overrides: Partial<BlogCategory> = {},
): Promise<BlogCategory> {
  const n = next();
  const repository = dataSource.getRepository(BlogCategory);
  return repository.save(
    repository.create({
      name: `Blog category ${n}`,
      slug: `blog-category-${n}`,
      ...overrides,
    }),
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A date `days` from now: negative = in the past. */
export const daysFromNow = (days: number) =>
  new Date(Date.now() + days * DAY_MS);

/**
 * Published a day ago by default. `publishedAt: null` makes a draft, a future
 * date (`daysFromNow(1)`) a scheduled post.
 */
export function createBlogPost(
  dataSource: DataSource,
  overrides: Partial<BlogPost> = {},
): Promise<BlogPost> {
  const n = next();
  const repository = dataSource.getRepository(BlogPost);
  return repository.save(
    repository.create({
      slug: `blog-post-${n}`,
      title: `Blog post ${n}`,
      text: `## Post ${n}\n\nSome **news** about our dishes.`,
      image: null,
      seo: { title: null, description: null },
      publishedAt: daysFromNow(-1),
      categories: [],
      ...overrides,
    }),
  );
}

/** A section to create with a page; `position` defaults to its index. */
export interface SectionInput {
  type: SectionType;
  data: object;
  position?: number;
}

/**
 * Published a day ago by default, like createBlogPost. Section data goes
 * through validateSectionData() first, the same check the real writers
 * (data migration, admin) use, so a test can't store data they'd reject.
 * E.g. `createPage(ds, { slug: 'home' }, [{ type: SectionType.News, data: {} }])`.
 */
export async function createPage(
  dataSource: DataSource,
  overrides: Partial<Page> = {},
  sections: SectionInput[] = [],
): Promise<Page> {
  const n = next();
  const pageRepository = dataSource.getRepository(Page);
  const page = await pageRepository.save(
    pageRepository.create({
      slug: `page-${n}`,
      title: `Page ${n}`,
      seo: { title: null, description: null },
      publishedAt: daysFromNow(-1),
      ...overrides,
    }),
  );

  const sectionRepository = dataSource.getRepository(PageSection);
  page.sections = await sectionRepository.save(
    await Promise.all(
      sections.map(async ({ type, data, position }, index) =>
        sectionRepository.create({
          page,
          type,
          position: position ?? index,
          data: await validateSectionData(type, data),
        }),
      ),
    ),
  );
  return page;
}

/** The password of every createUser() user unless a test sets another. */
export const TEST_PASSWORD = 'correct horse battery';

/**
 * E.g. `createUser(ds, { role: UserRole.Admin })` or
 * `createUser(ds, { password: 'other secret' })`. Hashes with bcrypt's
 * minimum cost (4), as BCRYPT_ROUNDS does in the e2e tests.
 */
export async function createUser(
  dataSource: DataSource,
  {
    password = TEST_PASSWORD,
    ...overrides
  }: Partial<User> & { password?: string } = {},
): Promise<User> {
  const n = next();
  const repository = dataSource.getRepository(User);
  return repository.save(
    repository.create({
      name: `User ${n}`,
      email: `user${n}@example.com`,
      passwordHash: await bcrypt.hash(password, 4),
      phone: null,
      address: null,
      ...overrides,
    }),
  );
}

/** One line for createOrder(); `position` and `lineTotal` are computed. */
export type OrderItemInput = Partial<
  Omit<OrderItem, 'order' | 'position' | 'lineTotal'>
>;

/**
 * A guest delivery order with one item, unless told otherwise. Items take
 * the product's title and price when one is given; positions, line totals
 * and the subtotal are computed as the service does. E.g.
 * `createOrder(ds, { user }, [{ product, quantity: 2 }, { unitPrice: 0 }])`.
 */
export function createOrder(
  dataSource: DataSource,
  overrides: Partial<Omit<Order, 'items'>> = {},
  items: OrderItemInput[] = [{}],
): Promise<Order> {
  const n = next();
  const itemRepository = dataSource.getRepository(OrderItem);
  const lines = items.map((item, position) => {
    const unitPrice = item.unitPrice ?? item.product?.price ?? 10000;
    const quantity = item.quantity ?? 1;
    return itemRepository.create({
      title: item.product?.title ?? `Dish ${n}.${position + 1}`,
      product: null,
      ...item,
      unitPrice,
      quantity,
      position,
      lineTotal: unitPrice * quantity,
    });
  });

  const repository = dataSource.getRepository(Order);
  return repository.save(
    repository.create({
      user: null,
      name: `Customer ${n}`,
      email: `customer${n}@example.com`,
      phone: '+380 67 123 45 67',
      address: `Kyiv, Khreshchatyk St, ${n}`,
      shippingMethod: ShippingMethod.Delivery,
      comments: null,
      legacyDishesText: null,
      subtotal: lines.reduce((sum, line) => sum + line.lineTotal, 0),
      ...overrides,
      items: lines,
    }),
  );
}
