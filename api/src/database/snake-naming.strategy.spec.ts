import {
  Column,
  DataSource,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SnakeNamingStrategy } from './snake-naming.strategy';

describe('SnakeNamingStrategy', () => {
  const strategy = new SnakeNamingStrategy();

  describe('tableName', () => {
    it('snake-cases the class name', () => {
      expect(strategy.tableName('ProductCategory', undefined)).toBe(
        'product_category',
      );
    });

    it('keeps a custom name exactly as given', () => {
      expect(strategy.tableName('ProductCategory', 'Legacy_Table')).toBe(
        'Legacy_Table',
      );
    });
  });

  describe('columnName', () => {
    it('snake-cases the property name', () => {
      expect(strategy.columnName('createdAt', undefined, [])).toBe(
        'created_at',
      );
    });

    it('keeps a custom name exactly as given', () => {
      expect(strategy.columnName('createdAt', 'Created_On', [])).toBe(
        'Created_On',
      );
    });

    it('prefixes columns of an embedded entity', () => {
      expect(strategy.columnName('title', undefined, ['seo'])).toBe(
        'seo_title',
      );
    });

    it('prefixes columns of nested embeddeds', () => {
      expect(strategy.columnName('id', undefined, ['seo', 'shareImage'])).toBe(
        'seo_share_image_id',
      );
    });

    it('prefixes a custom name inside an embedded', () => {
      expect(strategy.columnName('title', 'meta', ['seo'])).toBe('seo_meta');
    });

    it.each([
      ['userID', 'user_id'],
      ['HTMLParser', 'html_parser'],
      ['seoTitle2', 'seo_title2'],
      ['already_snake', 'already_snake'],
    ])('handles %s -> %s', (input, expected) => {
      expect(strategy.columnName(input, undefined, [])).toBe(expected);
    });
  });

  it('relationName snake-cases the property', () => {
    expect(strategy.relationName('productCategories')).toBe(
      'product_categories',
    );
  });

  it('joinColumnName combines relation and referenced column', () => {
    expect(strategy.joinColumnName('mainCategory', 'id')).toBe(
      'main_category_id',
    );
  });

  describe('joinTableName', () => {
    it('combines both tables and the owning property', () => {
      expect(
        strategy.joinTableName('product', 'product_category', 'categories'),
      ).toBe('product_categories_product_category');
    });

    it('replaces dots of a property path inside an embedded', () => {
      expect(strategy.joinTableName('page', 'media', 'seo.images')).toBe(
        'page_seo_images_media',
      );
    });
  });

  describe('joinTableColumnName', () => {
    it('uses the column name when given', () => {
      expect(strategy.joinTableColumnName('product', 'id', 'id')).toBe(
        'product_id',
      );
    });

    it('falls back to the property name', () => {
      expect(strategy.joinTableColumnName('product', 'productId')).toBe(
        'product_product_id',
      );
    });
  });

  /**
   * The unit tests above call the strategy directly. This block checks what
   * TypeORM actually produces from real entities, so a TypeORM upgrade that
   * changes how (or with which arguments) the strategy is called fails here.
   * No DB connection is opened: only entity metadata is built.
   */
  describe('with real entity metadata', () => {
    class Seo {
      @Column('text')
      title: string;

      @Column('int')
      shareImageId: number;
    }

    @Entity()
    class ProductCategory {
      @PrimaryGeneratedColumn()
      id: number;

      @Column('text')
      displayName: string;

      @ManyToMany(() => Product, (product) => product.categories)
      products: Product[];
    }

    @Entity()
    class Product {
      @PrimaryGeneratedColumn()
      id: number;

      @Column('timestamptz')
      createdAt: Date;

      @Column('text', { name: 'Legacy_Title' })
      title: string;

      @Column(() => Seo)
      seo: Seo;

      @ManyToOne(() => ProductCategory)
      mainCategory: ProductCategory;

      @ManyToMany(() => ProductCategory, (category) => category.products)
      @JoinTable()
      categories: ProductCategory[];
    }

    let dataSource: DataSource;

    beforeAll(async () => {
      dataSource = new DataSource({
        type: 'postgres',
        entities: [Product, ProductCategory],
        namingStrategy: new SnakeNamingStrategy(),
      });
      // buildMetadatas() is protected; it's what initialize() runs, minus connecting.
      await (
        dataSource as unknown as { buildMetadatas(): Promise<void> }
      ).buildMetadatas();
    });

    const columnsOf = (entity: Function) =>
      dataSource
        .getMetadata(entity)
        .columns.map((column) => column.databaseName)
        .sort();

    it('names tables in snake_case', () => {
      expect(dataSource.getMetadata(Product).tableName).toBe('product');
      expect(dataSource.getMetadata(ProductCategory).tableName).toBe(
        'product_category',
      );
    });

    it('names columns, embeddeds, custom names and foreign keys', () => {
      expect(columnsOf(Product)).toEqual(
        [
          'id',
          'created_at',
          'Legacy_Title',
          'seo_title',
          'seo_share_image_id',
          'main_category_id',
        ].sort(),
      );
      expect(columnsOf(ProductCategory)).toEqual(['display_name', 'id']);
    });

    it('names the many-to-many join table and its columns', () => {
      const [junction] = dataSource
        .getMetadata(Product)
        .manyToManyRelations.map(
          (relation) => relation.junctionEntityMetadata!,
        );

      expect(junction.tableName).toBe('product_categories_product_category');
      expect(
        junction.columns.map((column) => column.databaseName).sort(),
      ).toEqual(['product_category_id', 'product_id']);
    });
  });
});
