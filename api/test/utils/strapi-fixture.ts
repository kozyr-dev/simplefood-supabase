import { mkdir, writeFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { join } from 'node:path';
import { testImage } from './images';

/*
 * A small Strapi 5 SQLite database for the import tests: only the tables
 * and columns the import reads, filled the way Strapi fills them (a draft
 * and a published row per document, datetimes as epoch ms, components in
 * `<owner>_cmps` tables, media links in `files_related_mph`).
 */

const DOCUMENTS = [
  'product_categories(name, slug)',
  'products(slug, title, description, weight, callories, available, featured, favorite, price)',
  'blog_categories(name, slug)',
  'blog_posts(title, text, slug)',
  'site_options(site_name, phone, address, working_hours, taking_orders_hours, facebook, instagram)',
  'header_menus()',
  'footer_menus()',
  'dropdown_menus()',
  'homepages(title, slug)',
  'pages(title, slug)',
  'orders(address, name, phone, dishes, amount, email, comments, status)',
  'contact_submissions(name, email, message)',
];

const TABLES = [
  'files(document_id, name, alternative_text, width, height, formats, mime, size, url, created_at, updated_at, published_at)',
  'files_related_mph(file_id, related_id, related_type, field, "order")',
  'files_folder_lnk(file_id, folder_id)',
  'upload_folders(name)',
  'products_product_categories_lnk(product_id, product_category_id)',
  'blog_posts_blog_categories_lnk(blog_post_id, blog_category_id)',
  'components_seo_seo_titles(seo_title, seo_description)',
  'components_ui_menus(title, link, classname)',
  'components_ui_menu_lists(title, link, classname)',
  'components_ui_buttons(text, url)',
  'components_ui_articles(title, text)',
  'components_ui_benefits(title, text)',
  'components_sections_image_banners(title, text, background_color)',
  'components_sections_products(title, source, layout, custom_id, custom_class)',
  'components_sections_products_product_category_lnk(products_id, product_category_id)',
  'components_sections_products_products_lnk(products_id, product_id)',
  'components_sections_benefits(title)',
  'components_sections_articles(title, custom_id, custom_class)',
  'components_sections_image_galleries(title)',
  'components_sections_video_blocks(title, description, embed_video_url)',
  'components_sections_news_sections(title, layout)',
  'components_sections_news_sections_blog_category_lnk(news_section_id, blog_category_id)',
  'components_sections_contents(title, content, embed_code)',
  'components_sections_contacts(title, map_embed_code, content, content_2, form, form_title)',
  'components_sections_promo_blocks(title, text, invert_layout)',
  'up_users(username, email, provider, password, confirmed, blocked, phone, address, created_at, updated_at)',
  'up_roles(type)',
  'up_users_role_lnk(user_id, role_id)',
  'orders_users_permissions_user_lnk(order_id, user_id)',
];

/** Tables whose rows own components. */
const OWNERS = [
  'blog_posts',
  'site_options',
  'header_menus',
  'footer_menus',
  'dropdown_menus',
  'homepages',
  'pages',
  'components_sections_image_banners',
  'components_sections_benefits',
  'components_sections_articles',
  'components_sections_contents',
  'components_sections_promo_blocks',
];

export type Values = Record<string, SQLInputValue>;

/** The ids of a document's two rows. */
export interface StrapiDocument {
  draft: number;
  published: number;
}

let documents = 0;

export class StrapiFixture {
  readonly db: DatabaseSync;

  private constructor(
    readonly sqlitePath: string,
    readonly uploadsDir: string,
  ) {
    this.db = new DatabaseSync(sqlitePath);
    const create = (definition: string) => {
      const [, name, columns] = /^(\w+)\((.*)\)$/.exec(definition) ?? [];
      const list = columns ? `, ${columns}` : '';
      this.db.exec(
        `CREATE TABLE ${name} (id INTEGER PRIMARY KEY AUTOINCREMENT${list})`,
      );
    };
    for (const definition of DOCUMENTS) {
      const [, name, columns] = /^(\w+)\((.*)\)$/.exec(definition) ?? [];
      const extra = columns ? `${columns}, ` : '';
      create(
        `${name}(${extra}document_id, created_at, updated_at, published_at)`,
      );
    }
    TABLES.forEach(create);
    for (const owner of OWNERS) {
      create(
        `${owner}_cmps(entity_id, cmp_id, component_type, field, "order")`,
      );
    }
  }

  /** A fixture in `dir`: `dir/data.db` and `dir/uploads/`. */
  static async create(dir: string): Promise<StrapiFixture> {
    const uploads = join(dir, 'uploads');
    await mkdir(uploads, { recursive: true });
    return new StrapiFixture(join(dir, 'data.db'), uploads);
  }

  close(): void {
    this.db.close();
  }

  /** Inserts a row; returns its id. */
  insert(table: string, values: Values = {}): number {
    const keys = Object.keys(values);
    const sql = keys.length
      ? `INSERT INTO ${table} (${keys.map((key) => `"${key}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
      : `INSERT INTO ${table} DEFAULT VALUES`;
    const { lastInsertRowid } = this.db
      .prepare(sql)
      .run(...Object.values(values));
    return Number(lastInsertRowid);
  }

  /**
   * A document as Strapi keeps it: a draft row (the editor's copy) and a
   * published row. `draft` changes the draft only, to tell them apart.
   */
  document(
    table: string,
    values: Values,
    {
      createdAt = Date.UTC(2024, 0, 1),
      draft = {},
    }: { createdAt?: number; draft?: Values } = {},
  ): StrapiDocument {
    const document_id = `doc${++documents}`;
    const common = {
      ...values,
      document_id,
      created_at: createdAt,
      updated_at: createdAt,
    };
    return {
      draft: this.insert(table, { ...common, ...draft, published_at: null }),
      published: this.insert(table, {
        ...common,
        published_at: createdAt + 1000,
      }),
    };
  }

  /** Attaches a component to a row's field, at `order`. */
  attach(
    owner: string,
    entityId: number,
    field: string,
    type: string,
    componentId: number,
    order = 1,
  ): void {
    this.insert(`${owner}_cmps`, {
      entity_id: entityId,
      cmp_id: componentId,
      component_type: type,
      field,
      order,
    });
  }

  /** Links files to a media field of a row or component. */
  media(
    relatedType: string,
    field: string,
    relatedId: number,
    fileIds: number[],
  ): void {
    fileIds.forEach((fileId, index) =>
      this.insert('files_related_mph', {
        file_id: fileId,
        related_id: relatedId,
        related_type: relatedType,
        field,
        order: index + 1,
      }),
    );
  }

  /**
   * An uploaded file and, for each size given, its copy, all written to
   * the uploads folder. Strapi fills alt with the file name by default.
   */
  async file(
    name: string,
    {
      width = 1200,
      height = 800,
      alt = name,
      sizes = [] as ('thumbnail' | 'small' | 'medium' | 'large')[],
      folderId,
    }: {
      width?: number;
      height?: number;
      alt?: string | null;
      sizes?: ('thumbnail' | 'small' | 'medium' | 'large')[];
      folderId?: number;
    } = {},
  ): Promise<number> {
    const hash = `${name.replace(/\W/g, '_')}_${++documents}`;
    const formats: Record<string, object> = {};
    for (const size of sizes) {
      const file = `${size}_${hash}.jpg`;
      await writeFile(join(this.uploadsDir, file), await testImage(100, 80));
      formats[size] = {
        url: `/uploads/${file}`,
        width: 100,
        height: 80,
        name: file,
        hash: `${size}_${hash}`,
        ext: '.jpg',
        mime: 'image/jpeg',
        size: 2.5,
      };
    }
    await writeFile(
      join(this.uploadsDir, `${hash}.jpg`),
      await testImage(width, height),
    );
    const id = this.insert('files', {
      document_id: `file${documents}`,
      name,
      alternative_text: alt,
      width,
      height,
      formats: sizes.length ? JSON.stringify(formats) : null,
      mime: 'image/jpeg',
      size: 120.5,
      url: `/uploads/${hash}.jpg`,
      created_at: Date.UTC(2023, 5, 1),
      updated_at: Date.UTC(2023, 5, 1),
      published_at: Date.UTC(2023, 5, 1),
    });
    if (folderId !== undefined) {
      this.insert('files_folder_lnk', { file_id: id, folder_id: folderId });
    }
    return id;
  }
}
