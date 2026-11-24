import { describe, expect, it } from 'vitest';
import {
  SECTION_FIELDS,
  SECTION_TYPES,
  emptySectionData,
  sectionDataToSave,
} from './sections';

describe('sectionDataToSave', () => {
  it("keeps the type's fields only, without empty values", () => {
    expect(
      sectionDataToSave('promo', {
        title: 'Акція',
        text: '',
        button: { text: '', url: null },
        imageId: null,
        invertLayout: false,
        embedCode: '<iframe>', // left from another type
      }),
    ).toEqual({ title: 'Акція', invertLayout: false });
  });

  it('keeps list items in order, each without empty fields', () => {
    expect(
      sectionDataToSave('benefits', {
        items: [
          { title: 'Швидко', text: '' },
          { title: 'Смачно', iconId: 'i1' },
        ],
      }),
    ).toEqual({
      items: [{ title: 'Швидко' }, { title: 'Смачно', iconId: 'i1' }],
    });
  });

  it.each([
    ['featured', {}],
    ['category', { categoryId: 'c1' }],
    ['selected', { productIds: ['p2', 'p1'] }],
  ])('keeps only what products from %s use', (source, kept) => {
    expect(
      sectionDataToSave('products', {
        source,
        categoryId: 'c1',
        productIds: ['p2', 'p1'],
      }),
    ).toEqual({ source, ...kept });
  });

  it('starts a products section with a source; the others empty', () => {
    expect(emptySectionData('products')).toEqual({ source: 'featured' });
    expect(emptySectionData('video')).toEqual({});
  });

  it('knows the fields of every type', () => {
    expect(Object.keys(SECTION_FIELDS).sort()).toEqual(
      [...SECTION_TYPES].sort(),
    );
  });
});
