import type { EntityManager } from 'typeorm';
import { BlogCategory } from '@/blog/entities/blog-category.entity';
import { BlogPost } from '@/blog/entities/blog-post.entity';
import { ProductCategory } from '@/catalog/entities/product-category.entity';
import { Product } from '@/catalog/entities/product.entity';
import { ContactSubmission } from '@/contact/entities/contact-submission.entity';
import { Menu, MenuKey } from '@/content/entities/menu.entity';
import { MenuItem, MenuItemGroup } from '@/content/entities/menu-item.entity';
import { PageSection } from '@/content/entities/page-section.entity';
import { HOME_PAGE_SLUG, Page } from '@/content/entities/page.entity';
import {
  SITE_SETTINGS_ID,
  SiteSettings,
} from '@/content/entities/site-settings.entity';
import type { Seo } from '@/database/entities/seo.embedded';
import {
  Media,
  type MediaFormat,
  type MediaFormats,
} from '@/media/entities/media.entity';
import { fileNameOf } from '@/media/services/file-names';
import {
  Order,
  OrderStatus,
  ShippingMethod,
} from '@/orders/entities/order.entity';
import { User, UserRole } from '@/users/entities/user.entity';
import { mapSection, type ImportedIds } from '../mappers/sections';
import {
  altText,
  folderName,
  kilobytesToBytes,
  strapiBoolean,
  sqlText,
  strapiDate,
  textOrNull,
  toKopiykas,
} from '../mappers/values';
import type { Row, StrapiReader } from './strapi-reader';

/** What was imported, for the report and the checks. */
export interface ImportResult {
  counts: Record<string, number>;
  /** Stored file names (originals and sizes) the imported media point to. */
  files: string[];
  /** Things left out or changed on the way, without personal data. */
  warnings: string[];
}

/** The tables the import fills, children first (for emptying them). */
export const IMPORTED_TABLES = [
  'page_section',
  'page',
  'menu_item',
  'menu',
  'site_settings',
  'blog_post_to_category',
  'blog_post',
  'blog_category',
  'product_to_category',
  'product',
  'product_category',
  'order_item',
  'customer_order',
  'contact_submission',
  'account_token',
  'refresh_token',
  'app_user',
  'media',
] as const;

const SIZES = ['thumbnail', 'small', 'medium', 'large'] as const;
const STATUSES = new Set<string>(Object.values(OrderStatus));

const num = (value: unknown) => Number(value);
const str = sqlText;

/** Strapi's created/updated times, for rows that keep their history. */
function timestamps(row: Row) {
  const createdAt = strapiDate(row.created_at) ?? new Date();
  return { createdAt, updatedAt: strapiDate(row.updated_at) ?? createdAt };
}

/**
 * Copies the published Strapi content, the customers, their orders and the
 * contact messages into our tables, through `manager` (the caller's
 * transaction). Ids are new; Strapi's are only used to connect rows.
 */
export class StrapiImporter {
  private readonly warnings: string[] = [];
  private readonly counts: Record<string, number> = {};
  private readonly files = new Set<string>();

  private readonly mediaIds = new Map<number, string>();
  private readonly categoryIds = new Map<string, string>();
  private readonly productIds = new Map<string, string>();
  private readonly blogCategoryIds = new Map<string, string>();
  private readonly userIds = new Map<number, string>();

  constructor(
    private readonly reader: StrapiReader,
    private readonly manager: EntityManager,
  ) {}

  async run(): Promise<ImportResult> {
    await this.importMedia();
    await this.importCatalog();
    await this.importBlog();
    await this.importSettings();
    await this.importMenus();
    await this.importPages();
    await this.importUsers();
    await this.importOrders();
    await this.importContacts();
    return {
      counts: this.counts,
      files: [...this.files].sort(),
      warnings: this.warnings,
    };
  }

  private count(name: string, value: number) {
    this.counts[name] = value;
  }

  /** New ids by Strapi row id, for relations that point at any row of a document. */
  private byRow(name: string, idsByDocument: Map<string, string>) {
    const documents = this.reader.documentIds(name);
    return (rowId: number) => {
      const document = documents.get(rowId);
      return document === undefined ? undefined : idsByDocument.get(document);
    };
  }

  private seo(owner: string, entityId: number): Seo {
    const seo = this.reader.oneComponent(owner, entityId, 'SEO');
    return {
      title: textOrNull(seo?.seo_title),
      description: textOrNull(seo?.seo_description),
    };
  }

  private mediaRef(type: string, field: string, rowId: number): Media | null {
    const fileId = this.reader.media(type, field, rowId)[0];
    const id = fileId === undefined ? undefined : this.mediaIds.get(fileId);
    return id ? ({ id } as Media) : null;
  }

  /**
   * Every Strapi file, as it is: same URLs, same sizes (Strapi made the
   * same four), so nothing is reprocessed. The files are copied later.
   */
  private async importMedia() {
    const folders = new Map(
      this.reader
        .all('files_folder_lnk')
        .map((link) => [num(link.file_id), num(link.folder_id)]),
    );
    const folderNames = new Map(
      this.reader
        .all('upload_folders')
        .map((folder) => [num(folder.id), str(folder.name)]),
    );
    const repository = this.manager.getRepository(Media);

    for (const file of this.reader.all('files')) {
      const url = str(file.url);
      const name = fileNameOf(url);
      if (!name) {
        throw new Error(`File ${num(file.id)} has an unexpected URL`);
      }
      this.files.add(name);

      const formats: MediaFormats = {};
      const stored = JSON.parse(textOrNull(file.formats) ?? '{}') as Record<
        string,
        Partial<MediaFormat>
      >;
      for (const size of SIZES) {
        const format = stored[size];
        if (!format) continue;
        const formatName = fileNameOf(str(format.url));
        if (!formatName) {
          throw new Error(`File ${num(file.id)} has an unexpected ${size} URL`);
        }
        this.files.add(formatName);
        formats[size] = {
          url: str(format.url),
          width: num(format.width),
          height: num(format.height),
        };
      }

      const folderId = folders.get(num(file.id));
      const saved = await repository.save(
        repository.create({
          url,
          name: str(file.name).slice(0, 255),
          mime: str(file.mime),
          size: kilobytesToBytes(num(file.size)),
          width: file.width === null ? null : num(file.width),
          height: file.height === null ? null : num(file.height),
          alt: altText(file.alternative_text, str(file.name)),
          folder: folderName(
            folderId === undefined ? null : (folderNames.get(folderId) ?? null),
          ),
          formats: Object.keys(formats).length ? formats : null,
          ...timestamps(file),
        }),
      );
      this.mediaIds.set(num(file.id), saved.id);
    }
    this.count('media', this.mediaIds.size);
  }

  private async importCatalog() {
    const categories = this.manager.getRepository(ProductCategory);
    // Strapi has no category order; its API lists them by id.
    for (const [position, row] of this.reader
      .published('product_categories')
      .entries()) {
      const saved = await categories.save(
        categories.create({
          name: str(row.name),
          slug: str(row.slug),
          position,
          ...timestamps(row),
        }),
      );
      this.categoryIds.set(str(row.document_id), saved.id);
    }
    this.count('productCategories', this.categoryIds.size);

    const categoryOfRow = this.byRow('product_categories', this.categoryIds);
    const products = this.manager.getRepository(Product);
    let withoutImage = 0;
    for (const row of this.reader.published('products')) {
      // `image` only: `Image` links are left over from Strapi 4 and point
      // at files the current schema no longer shows.
      const image = this.mediaRef('api::product.product', 'image', num(row.id));
      if (!image) withoutImage++;
      const weight = row.weight === null ? null : num(row.weight);
      const calories = row.callories === null ? null : num(row.callories);
      const saved = await products.save(
        products.create({
          slug: str(row.slug),
          title: str(row.title),
          description: textOrNull(row.description),
          price: toKopiykas(num(row.price)),
          weight: weight !== null && weight > 0 ? weight : null,
          calories: calories !== null && calories >= 0 ? calories : null,
          available: strapiBoolean(row.available),
          featured: strapiBoolean(row.featured),
          favorite: strapiBoolean(row.favorite),
          image,
          categories: this.reader
            .links(
              'products_product_categories_lnk',
              'product_id',
              'product_category_id',
              num(row.id),
            )
            .flatMap((rowId) => {
              const id = categoryOfRow(rowId);
              return id ? [{ id } as ProductCategory] : [];
            }),
          ...timestamps(row),
        }),
      );
      this.productIds.set(str(row.document_id), saved.id);
    }
    this.count('products', this.productIds.size);
    if (withoutImage) {
      this.warnings.push(`${withoutImage} product(s) have no image`);
    }
  }

  private async importBlog() {
    const categories = this.manager.getRepository(BlogCategory);
    for (const row of this.reader.published('blog_categories')) {
      const saved = await categories.save(
        categories.create({
          name: str(row.name),
          slug: str(row.slug),
          ...timestamps(row),
        }),
      );
      this.blogCategoryIds.set(str(row.document_id), saved.id);
    }
    this.count('blogCategories', this.blogCategoryIds.size);

    const categoryOfRow = this.byRow('blog_categories', this.blogCategoryIds);
    const posts = this.manager.getRepository(BlogPost);
    let count = 0;
    for (const row of this.reader.published('blog_posts')) {
      await posts.save(
        posts.create({
          slug: str(row.slug),
          title: str(row.title),
          text: str(row.text ?? ''),
          image: this.mediaRef(
            'api::blog-post.blog-post',
            'Image',
            num(row.id),
          ),
          seo: this.seo('blog_posts', num(row.id)),
          publishedAt: strapiDate(row.published_at),
          categories: this.reader
            .links(
              'blog_posts_blog_categories_lnk',
              'blog_post_id',
              'blog_category_id',
              num(row.id),
            )
            .flatMap((rowId) => {
              const id = categoryOfRow(rowId);
              return id ? [{ id } as BlogCategory] : [];
            }),
          ...timestamps(row),
        }),
      );
      count++;
    }
    this.count('blogPosts', count);
  }

  private async importSettings() {
    const [row] = this.reader.published('site_options');
    if (!row) {
      this.warnings.push('No published site options: settings left empty');
      this.count('siteSettings', 0);
      return;
    }
    await this.manager.getRepository(SiteSettings).save({
      id: SITE_SETTINGS_ID,
      siteName: str(row.site_name ?? 'SimpleFood'),
      phone: textOrNull(row.phone),
      address: textOrNull(row.address),
      workingHours: textOrNull(row.working_hours),
      takingOrdersHours: textOrNull(row.taking_orders_hours),
      facebook: textOrNull(row.facebook),
      instagram: textOrNull(row.instagram),
      seo: this.seo('site_options', num(row.id)),
    });
    this.count('siteSettings', 1);
  }

  /**
   * The three single-type menus. Only the fields in the current schema:
   * the dropdown also has items under an older `MenuListItem` field, which
   * Strapi no longer shows (two of them link to pages that don't exist).
   */
  private async importMenus() {
    const fields: [MenuKey, string, [string, MenuItemGroup][]][] = [
      [MenuKey.Header, 'header_menus', [['menuItem', MenuItemGroup.Main]]],
      [MenuKey.Footer, 'footer_menus', [['footerMenu', MenuItemGroup.Main]]],
      [
        MenuKey.Dropdown,
        'dropdown_menus',
        [
          ['menuItem', MenuItemGroup.Main],
          ['menuListItem', MenuItemGroup.List],
        ],
      ],
    ];
    const menus = this.manager.getRepository(Menu);
    const items = this.manager.getRepository(MenuItem);
    for (const [key, table, groups] of fields) {
      const [row] = this.reader.published(table);
      if (!row) {
        this.warnings.push(`No published ${table}: menu "${key}" left out`);
        continue;
      }
      const menu = await menus.save(menus.create({ key }));
      let count = 0;
      for (const [field, group] of groups) {
        for (const [position, ref] of this.reader
          .components(table, num(row.id), field)
          .entries()) {
          const item = this.reader.component(ref);
          await items.save(
            items.create({
              menu,
              title: str(item.title),
              link: str(item.link),
              className: textOrNull(item.classname),
              group,
              position,
            }),
          );
          count++;
        }
      }
      this.count(`menu.${key}`, count);
    }
  }

  private async importPages() {
    const ids: ImportedIds = {
      media: (fileId) => this.mediaIds.get(fileId),
      product: this.byRow('products', this.productIds),
      productCategory: this.byRow('product_categories', this.categoryIds),
      blogCategory: this.byRow('blog_categories', this.blogCategoryIds),
    };
    const pages = this.manager.getRepository(Page);
    const sections = this.manager.getRepository(PageSection);

    const sources: [string, string, Row][] = [
      ...this.reader
        .published('homepages')
        .map((row): [string, string, Row] => ['homepages', 'Body', row]),
      ...this.reader
        .published('pages')
        .map((row): [string, string, Row] => ['pages', 'body', row]),
    ];
    let pageCount = 0;
    let sectionCount = 0;
    for (const [table, field, row] of sources) {
      let slug = str(row.slug);
      if (table === 'homepages' && slug !== HOME_PAGE_SLUG) {
        this.warnings.push(`The homepage's slug "${slug}" became "home"`);
        slug = HOME_PAGE_SLUG;
      }
      const page = await pages.save(
        pages.create({
          slug,
          title: str(row.title),
          seo: this.seo(table, num(row.id)),
          publishedAt: strapiDate(row.published_at),
          ...timestamps(row),
        }),
      );
      pageCount++;

      for (const [position, ref] of this.reader
        .components(table, num(row.id), field)
        .entries()) {
        const { type, data } = await mapSection(
          this.reader,
          ref,
          ids,
          this.warnings,
        );
        await sections.save(sections.create({ page, position, type, data }));
        sectionCount++;
      }
    }
    this.count('pages', pageCount);
    this.count('pageSections', sectionCount);
  }

  /**
   * Customers with their Strapi password hashes (bcrypt; upgraded at the
   * next login). Not marked verified: Strapi had email confirmation off and
   * set `confirmed` on every account without checking anything.
   */
  private async importUsers() {
    const roles = new Map(
      this.reader.all('up_roles').map((role) => [num(role.id), str(role.type)]),
    );
    const roleOfUser = new Map(
      this.reader
        .all('up_users_role_lnk')
        .map((link) => [num(link.user_id), roles.get(num(link.role_id))]),
    );
    const users = this.manager.getRepository(User);
    for (const row of this.reader.all('up_users')) {
      if (str(row.provider) !== 'local') {
        this.warnings.push(
          `User ${num(row.id)} signed in with ${str(row.provider)}`,
        );
      }
      const role = roleOfUser.get(num(row.id));
      if (role !== 'authenticated') {
        this.warnings.push(
          `User ${num(row.id)} had the role "${String(role)}": imported as a customer`,
        );
      }
      const saved = await users.save(
        users.create({
          name: str(row.username),
          email: str(row.email),
          passwordHash: str(row.password),
          phone: textOrNull(row.phone),
          address: textOrNull(row.address),
          role: UserRole.Customer,
          blocked: strapiBoolean(row.blocked),
          emailVerifiedAt: null,
          ...timestamps(row),
        }),
      );
      this.userIds.set(num(row.id), saved.id);
    }
    this.count('users', this.userIds.size);
  }

  /**
   * Strapi orders kept their dishes as text: they become orders without
   * items (`legacyDishesText`), numbered afresh in the order they were
   * placed. Strapi stored no shipping method; they were all deliveries.
   */
  private async importOrders() {
    const rows = this.reader
      .published('orders')
      .sort(
        (a, b) =>
          (strapiDate(a.created_at)?.getTime() ?? 0) -
            (strapiDate(b.created_at)?.getTime() ?? 0) || num(a.id) - num(b.id),
      );
    const orders = this.manager.getRepository(Order);
    for (const row of rows) {
      const strapiUser = this.reader.links(
        'orders_users_permissions_user_lnk',
        'order_id',
        'user_id',
        num(row.id),
      )[0];
      const address = textOrNull(row.address);
      const status = str(row.status ?? OrderStatus.New);
      if (!STATUSES.has(status)) {
        throw new Error(`Order ${num(row.id)} has an unknown status`);
      }
      await orders.save(
        orders.create({
          userId:
            strapiUser === undefined
              ? null
              : (this.userIds.get(strapiUser) ?? null),
          name: str(row.name),
          email: str(row.email),
          phone: str(row.phone),
          // No address can't be a delivery (a database check): pickup then.
          shippingMethod: address
            ? ShippingMethod.Delivery
            : ShippingMethod.Pickup,
          address,
          comments: textOrNull(row.comments),
          status: status as OrderStatus,
          subtotal: toKopiykas(num(row.amount ?? 0)),
          legacyDishesText: textOrNull(row.dishes),
          ...timestamps(row),
        }),
      );
      if (!address) {
        this.warnings.push(
          `Order ${num(row.id)} has no address: imported as pickup`,
        );
      }
    }
    this.count('orders', rows.length);
  }

  private async importContacts() {
    const repository = this.manager.getRepository(ContactSubmission);
    const rows = this.reader.published('contact_submissions');
    for (const row of rows) {
      await repository.save(
        repository.create({
          name: str(row.name),
          email: str(row.email),
          message: str(row.message),
          handledAt: null,
          ...timestamps(row),
        }),
      );
    }
    this.count('contactSubmissions', rows.length);
  }
}
