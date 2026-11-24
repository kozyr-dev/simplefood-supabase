import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DataSource, EntityManager } from 'typeorm';
import { LocalDiskStorage } from '@/media/services/local-disk-storage';
import { SECTION_TYPES } from '../mappers/sections';
import { toKopiykas } from '../mappers/values';
import {
  IMPORTED_TABLES,
  StrapiImporter,
  type ImportResult,
} from './strapi-importer';
import { StrapiReader } from './strapi-reader';

export interface ImportOptions {
  /** Strapi's SQLite file (`backend/.tmp/data.db`). */
  sqlitePath: string;
  /** Strapi's uploads folder (`backend/public/uploads`). */
  uploadsSource: string;
  /** Ours: UPLOADS_DIR. */
  uploadsTarget: string;
  /** Empty the imported tables first; without it, any data there stops the import. */
  replace: boolean;
  /** Do everything, check it, then roll back and copy nothing. */
  dryRun: boolean;
}

export interface ImportReport extends ImportResult {
  filesCopied: number;
  /** Already there with the same content (a re-run). */
  filesUnchanged: number;
  dryRun: boolean;
}

/** The import didn't match its source; nothing was saved. */
export class ImportCheckError extends Error {
  constructor(readonly problems: string[]) {
    super(`The import doesn't match Strapi:\n- ${problems.join('\n- ')}`);
    this.name = 'ImportCheckError';
  }
}

/**
 * Imports a Strapi database in one transaction: the tables are emptied
 * (with `replace`) and filled, the result is compared with the source, and
 * only then are the files copied and the transaction committed. Any error
 * leaves the database as it was. Copied files stay on a later failure,
 * which is harmless: a re-run finds them unchanged.
 */
export async function importStrapi(
  dataSource: DataSource,
  options: ImportOptions,
): Promise<ImportReport> {
  const reader = new StrapiReader(options.sqlitePath);
  const runner = dataSource.createQueryRunner();
  try {
    await runner.startTransaction();
    const { manager } = runner;

    await prepareTables(manager, options.replace);
    const result = await new StrapiImporter(reader, manager).run();
    const problems = await verify(reader, manager);
    if (problems.length) {
      throw new ImportCheckError(problems);
    }
    await assertSourceFiles(options.uploadsSource, result.files);

    if (options.dryRun) {
      await runner.rollbackTransaction();
      return { ...result, filesCopied: 0, filesUnchanged: 0, dryRun: true };
    }
    const copy = await copyFiles(options, result.files);
    await runner.commitTransaction();
    return { ...result, ...copy, dryRun: false };
  } catch (error) {
    if (runner.isTransactionActive) {
      await runner.rollbackTransaction();
    }
    throw error;
  } finally {
    await runner.release();
    reader.close();
  }
}

/** Refuses to mix with existing data, unless told to empty the tables. */
async function prepareTables(manager: EntityManager, replace: boolean) {
  const tables = IMPORTED_TABLES.map((name) => `"${name}"`).join(', ');
  if (replace) {
    // RESTART IDENTITY: imported orders are numbered from 1 again.
    await manager.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
    return;
  }
  const filled: string[] = [];
  for (const name of IMPORTED_TABLES) {
    const [{ found }] = (await manager.query(
      `SELECT EXISTS (SELECT 1 FROM "${name}") AS found`,
    )) as { found: boolean }[];
    if (found) filled.push(name);
  }
  if (filled.length) {
    throw new Error(
      `These tables already have data: ${filled.join(', ')}. ` +
        'Import into an empty database, or pass --replace to empty them first.',
    );
  }
}

async function countOf(manager: EntityManager, sql: string): Promise<number> {
  const [row] = (await manager.query(sql)) as { n: string }[];
  return Number(row.n);
}

/**
 * Compares what is now in Postgres with the Strapi source, independently
 * of how the importer got there.
 */
async function verify(
  reader: StrapiReader,
  manager: EntityManager,
): Promise<string[]> {
  const problems: string[] = [];
  const expect = (what: string, actual: number, expected: number) => {
    if (actual !== expected) {
      problems.push(`${what}: ${actual} imported, ${expected} in Strapi`);
    }
  };
  const count = (table: string) =>
    countOf(manager, `SELECT count(*) AS n FROM "${table}"`);

  expect('media', await count('media'), reader.all('files').length);
  expect(
    'product categories',
    await count('product_category'),
    reader.published('product_categories').length,
  );
  const products = reader.published('products');
  expect('products', await count('product'), products.length);
  expect(
    'products with an image',
    await countOf(
      manager,
      'SELECT count(*) AS n FROM product WHERE image_id IS NOT NULL',
    ),
    products.filter(
      (row) =>
        reader.media('api::product.product', 'image', Number(row.id)).length,
    ).length,
  );
  expect(
    'product-category links',
    await count('product_to_category'),
    products.reduce(
      (sum, row) =>
        sum +
        reader.links(
          'products_product_categories_lnk',
          'product_id',
          'product_category_id',
          Number(row.id),
        ).length,
      0,
    ),
  );
  expect(
    'blog categories',
    await count('blog_category'),
    reader.published('blog_categories').length,
  );
  expect(
    'blog posts',
    await count('blog_post'),
    reader.published('blog_posts').length,
  );
  expect('users', await count('app_user'), reader.all('up_users').length);
  const orders = reader.published('orders');
  expect('orders', await count('customer_order'), orders.length);
  expect(
    'order totals (kopiykas)',
    await countOf(
      manager,
      'SELECT coalesce(sum(subtotal), 0) AS n FROM customer_order',
    ),
    orders.reduce((sum, row) => sum + toKopiykas(Number(row.amount ?? 0)), 0),
  );
  expect(
    'contact messages',
    await count('contact_submission'),
    reader.published('contact_submissions').length,
  );

  // Each page's sections: the same types in the same order.
  const pages: [string, string, string][] = [
    ...reader
      .published('homepages')
      .map((): [string, string, string] => ['homepages', 'Body', 'home']),
    ...reader
      .published('pages')
      .map((row): [string, string, string] => [
        'pages',
        'body',
        String(row.slug),
      ]),
  ];
  expect('pages', await count('page'), pages.length);
  for (const [table, field, slug] of pages) {
    const row = reader
      .published(table)
      .find((page) => table === 'homepages' || String(page.slug) === slug);
    const expected = reader
      .components(table, Number(row?.id), field)
      .map((ref) => SECTION_TYPES[ref.type]);
    const actual = (
      (await manager.query(
        `SELECT s.type FROM page_section s JOIN page p ON p.id = s.page_id
         WHERE p.slug = $1 ORDER BY s.position`,
        [slug],
      )) as { type: string }[]
    ).map((section) => section.type);
    if (actual.join(',') !== expected.join(',')) {
      problems.push(
        `page "${slug}" sections: [${actual.join(', ')}], Strapi: [${expected.join(', ')}]`,
      );
    }
  }

  // Each menu: the same number of items in the schema's fields.
  const menus: [string, string, string[]][] = [
    ['header', 'header_menus', ['menuItem']],
    ['footer', 'footer_menus', ['footerMenu']],
    ['dropdown', 'dropdown_menus', ['menuItem', 'menuListItem']],
  ];
  for (const [key, table, fields] of menus) {
    const [row] = reader.published(table);
    const expected = row
      ? fields.reduce(
          (sum, field) =>
            sum + reader.components(table, Number(row.id), field).length,
          0,
        )
      : 0;
    expect(
      `${key} menu items`,
      await countOf(
        manager,
        `SELECT count(*) AS n FROM menu_item i JOIN menu m ON m.id = i.menu_id WHERE m.key = '${key}'`,
      ),
      expected,
    );
  }
  return problems;
}

/** Every file the media point to must be there before anything is copied. */
async function assertSourceFiles(dir: string, files: string[]) {
  const missing: string[] = [];
  for (const name of files) {
    await access(join(dir, name)).catch(() => missing.push(name));
  }
  if (missing.length) {
    throw new Error(
      `${missing.length} file(s) missing from ${dir}, e.g. ${missing.slice(0, 3).join(', ')}`,
    );
  }
}

/**
 * Copies the files under the same names. One already there is fine if it's
 * the same file (a re-run); a different file under that name stops the import.
 */
async function copyFiles(options: ImportOptions, files: string[]) {
  const storage = new LocalDiskStorage(options.uploadsTarget);
  await storage.init();
  let filesCopied = 0;
  let filesUnchanged = 0;
  for (const name of files) {
    const data = await readFile(join(options.uploadsSource, name));
    const existing = await readFile(join(options.uploadsTarget, name)).catch(
      () => null,
    );
    if (existing) {
      if (!existing.equals(data)) {
        throw new Error(
          `${name} already exists in the uploads folder with other content`,
        );
      }
      filesUnchanged++;
      continue;
    }
    await storage.save(name, data);
    filesCopied++;
  }
  return { filesCopied, filesUnchanged };
}
