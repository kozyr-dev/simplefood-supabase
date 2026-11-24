import { DatabaseSync } from 'node:sqlite';

/** A row as SQLite returns it. */
export type Row = Record<string, unknown>;

/** A component attached to an entry or to another component, in order. */
export interface ComponentRef {
  type: string;
  id: number;
  field: string;
}

/** The Strapi table of each component type the site uses. */
const COMPONENT_TABLES: Record<string, string> = {
  'sections.image-banner': 'components_sections_image_banners',
  'sections.products': 'components_sections_products',
  'sections.benefits': 'components_sections_benefits',
  'sections.articles': 'components_sections_articles',
  'sections.image-gallery': 'components_sections_image_galleries',
  'sections.video-block': 'components_sections_video_blocks',
  'sections.news-section': 'components_sections_news_sections',
  'sections.content': 'components_sections_contents',
  'sections.contact': 'components_sections_contacts',
  'sections.promo-block': 'components_sections_promo_blocks',
  'ui.button': 'components_ui_buttons',
  'ui.article': 'components_ui_articles',
  'ui.benefit': 'components_ui_benefits',
  'ui.menu': 'components_ui_menus',
  'ui.menu-list': 'components_ui_menu_lists',
  'seo.seo-title': 'components_seo_seo_titles',
};

/** Table names come from code, never from the data; checked all the same. */
const TABLE_NAME = /^[a-z_]+$/;

function table(name: string): string {
  if (!TABLE_NAME.test(name)) throw new Error(`Unexpected table name ${name}`);
  return `"${name}"`;
}

/**
 * Reads a Strapi 5 SQLite database (read-only). Strapi keeps a draft and a
 * published row per document; everything here reads the published one, and
 * maps any row (draft or published) to its document, so links work
 * whichever row they point to.
 */
export class StrapiReader {
  private readonly db: DatabaseSync;
  /** "<related type>|<field>|<related id>" → file ids, in Strapi's order. */
  private readonly mediaLinks = new Map<string, number[]>();

  constructor(path: string) {
    this.db = new DatabaseSync(path, { readOnly: true });
    const links = this.db
      .prepare(
        'SELECT file_id, related_id, related_type, field FROM files_related_mph ORDER BY "order", id',
      )
      .all();
    for (const link of links) {
      const key = `${String(link.related_type)}|${String(link.field)}|${Number(link.related_id)}`;
      const ids = this.mediaLinks.get(key) ?? [];
      ids.push(Number(link.file_id));
      this.mediaLinks.set(key, ids);
    }
  }

  close(): void {
    this.db.close();
  }

  /** All rows of a table, in id order (Strapi's default order). */
  all(name: string, where = '1 = 1'): Row[] {
    return this.db
      .prepare(`SELECT * FROM ${table(name)} WHERE ${where} ORDER BY id`)
      .all();
  }

  /** The published row of each document. */
  published(name: string): Row[] {
    return this.all(name, 'published_at IS NOT NULL');
  }

  /** Every row id (draft or published) → its document_id. */
  documentIds(name: string): Map<number, string> {
    return new Map(
      this.db
        .prepare(`SELECT id, document_id FROM ${table(name)}`)
        .all()
        .map((row) => [Number(row.id), String(row.document_id)]),
    );
  }

  /**
   * The components in `field` of an entry (or of another component), in
   * order. `owner` is the entry's or component's table.
   */
  components(owner: string, entityId: number, field: string): ComponentRef[] {
    return this.db
      .prepare(
        `SELECT cmp_id, component_type, field FROM ${table(`${owner}_cmps`)}
         WHERE entity_id = ? AND field = ? ORDER BY "order", id`,
      )
      .all(entityId, field)
      .map((row) => ({
        type: String(row.component_type),
        id: Number(row.cmp_id),
        field: String(row.field),
      }));
  }

  /** One component's row. */
  component({ type, id }: Pick<ComponentRef, 'type' | 'id'>): Row {
    const name = COMPONENT_TABLES[type];
    if (!name) throw new Error(`Unknown Strapi component type ${type}`);
    const row = this.db
      .prepare(`SELECT * FROM ${table(name)} WHERE id = ?`)
      .get(id);
    if (!row) throw new Error(`Missing ${type} component ${id}`);
    return row;
  }

  /** The table a component type is stored in. */
  componentTable(type: string): string {
    const name = COMPONENT_TABLES[type];
    if (!name) throw new Error(`Unknown Strapi component type ${type}`);
    return name;
  }

  /** The single component in `field`, or null. */
  oneComponent(owner: string, entityId: number, field: string): Row | null {
    const [ref] = this.components(owner, entityId, field);
    return ref ? this.component(ref) : null;
  }

  /** Files linked to a row's media field, in order (`relatedType`: e.g. `api::product.product`). */
  media(relatedType: string, field: string, relatedId: number): number[] {
    return this.mediaLinks.get(`${relatedType}|${field}|${relatedId}`) ?? [];
  }

  /**
   * The targets of a relation, from its link table, in link order (the
   * `*_ord` columns are empty in this database).
   */
  links(
    linkTable: string,
    ownerColumn: string,
    targetColumn: string,
    ownerId: number,
  ): number[] {
    for (const column of [ownerColumn, targetColumn]) {
      if (!TABLE_NAME.test(column)) throw new Error(`Bad column ${column}`);
    }
    return this.db
      .prepare(
        `SELECT ${targetColumn} AS target FROM ${table(linkTable)} WHERE ${ownerColumn} = ? ORDER BY id`,
      )
      .all(ownerId)
      .map((row) => Number(row.target));
  }
}
