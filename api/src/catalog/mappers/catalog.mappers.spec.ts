import { Media } from '@/media/entities/media.entity';
import { toProductCategoryDto, toProductDto } from './catalog.mappers';
import { ProductCategory } from '../entities/product-category.entity';
import { Product } from '../entities/product.entity';

const category = (name: string, position: number) =>
  Object.assign(new ProductCategory(), {
    id: `id-${name}`,
    name,
    slug: name.toLowerCase(),
    position,
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
  folder: 'products',
  formats: null,
});

function product(overrides: Partial<Product> = {}): Product {
  return Object.assign(new Product(), {
    id: 'product-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    slug: 'borscht',
    title: 'Borscht',
    description: '<p>Hot</p>',
    price: 18900,
    weight: 350,
    calories: 420,
    available: true,
    featured: false,
    favorite: true,
    image,
    categories: [category('Soups', 1)],
    ...overrides,
  });
}

describe('toProductCategoryDto', () => {
  it('returns id, name and slug only', () => {
    expect(toProductCategoryDto(category('Pizza', 3))).toEqual({
      id: 'id-Pizza',
      name: 'Pizza',
      slug: 'pizza',
    });
  });
});

describe('toProductDto', () => {
  it('returns the public fields, with the image and categories mapped', () => {
    expect(toProductDto(product())).toEqual({
      id: 'product-1',
      slug: 'borscht',
      title: 'Borscht',
      description: '<p>Hot</p>',
      price: 18900,
      weight: 350,
      calories: 420,
      available: true,
      featured: false,
      favorite: true,
      image: {
        id: 'media-1',
        url: '/uploads/borscht.jpg',
        alt: 'Borscht',
        width: 800,
        height: 600,
        formats: null,
      },
      categories: [{ id: 'id-Soups', name: 'Soups', slug: 'soups' }],
    });
  });

  it('leaves internal columns out', () => {
    const dto = toProductDto(product());

    expect(dto).not.toHaveProperty('createdAt');
    expect(dto).not.toHaveProperty('updatedAt');
    expect(dto.image).not.toHaveProperty('mime');
  });

  it('returns image: null for a product without a photo', () => {
    expect(toProductDto(product({ image: null })).image).toBeNull();
  });

  it('sorts categories by position, then name', () => {
    const dto = toProductDto(
      product({
        categories: [
          category('Soups', 2),
          category('Hot', 1),
          category('Drinks', 2),
        ],
      }),
    );

    expect(dto.categories.map((c) => c.name)).toEqual([
      'Hot',
      'Drinks',
      'Soups',
    ]);
  });

  it('does not reorder the entity it was given', () => {
    const categories = [category('B', 2), category('A', 1)];
    toProductDto(product({ categories }));

    expect(categories.map((c) => c.name)).toEqual(['B', 'A']);
  });

  it('copes with categories that were not loaded', () => {
    const unloaded = product();
    delete (unloaded as Partial<Product>).categories;

    expect(toProductDto(unloaded).categories).toEqual([]);
  });
});
