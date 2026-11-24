import { SectionType } from './page-section.entity';
import {
  InvalidSectionDataError,
  ProductsSectionData,
  validateSectionData,
} from './section-data';

const ID = '01a1559c-a1ed-7641-ac0e-64612b99bb5a';
const OTHER_ID = '01a1559c-a1ed-7641-ac0e-64612b99bb5b';
const button = { text: 'See the menu', url: '/simple-menu' };
const item = { title: 'Fast', text: 'In **40** minutes', iconId: ID };

/** Every field of every type filled in: the full contract in one place. */
const VALID: Record<SectionType, object> = {
  [SectionType.ImageBanner]: {
    title: 'Welcome',
    text: 'Home-style **food**',
    button,
    imageId: ID,
    backgroundColor: '#0D0B0C',
  },
  [SectionType.Products]: {
    title: 'Soups',
    source: 'category',
    categoryId: ID,
    layout: 'grid',
    anchorId: 'soup',
    className: 'section-dark wide',
  },
  [SectionType.Benefits]: { title: 'Why us', button, items: [item] },
  [SectionType.Articles]: {
    title: 'How we cook',
    button,
    items: [item],
    anchorId: 'delivery',
    className: 'articles',
  },
  [SectionType.ImageGallery]: { title: 'Gallery', imageIds: [ID, OTHER_ID] },
  [SectionType.Video]: {
    title: 'Our kitchen',
    description: 'Take a look',
    videoUrl: 'https://www.youtube.com/embed/sTDscPFvehQ',
    placeholderImageId: ID,
  },
  [SectionType.News]: { title: 'News', layout: 'list', blogCategoryId: ID },
  [SectionType.Content]: {
    title: 'About us',
    content: '## Hello',
    button,
    imageId: ID,
    embedCode: '<iframe src="https://example.com"></iframe>',
  },
  [SectionType.Contact]: {
    title: 'Contact',
    content: 'Call us',
    secondaryContent: 'Or write',
    mapEmbedCode: '<iframe src="https://www.google.com/maps/embed"></iframe>',
    showForm: true,
    formTitle: 'Write to us',
  },
  [SectionType.Promo]: {
    title: 'Simple box',
    text: 'Lunch for the office',
    button,
    iconId: ID,
    imageId: OTHER_ID,
    invertLayout: true,
  },
};

/** The validation messages, by field, of data that must be rejected. */
async function rejection(type: SectionType, data: unknown) {
  const error: unknown = await validateSectionData(type, data).then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof InvalidSectionDataError)) {
    throw new Error(
      `expected an InvalidSectionDataError, got ${String(error)}`,
    );
  }
  return Object.fromEntries(
    error.details.map(({ field, messages }) => [field, messages]),
  );
}

describe('validateSectionData', () => {
  it.each(Object.values(SectionType))(
    'accepts a fully filled-in "%s" section',
    async (type) => {
      await expect(validateSectionData(type, VALID[type])).resolves.toEqual(
        VALID[type],
      );
    },
  );

  it.each(
    Object.values(SectionType).filter((type) => type !== SectionType.Products),
  )(
    'accepts an empty "%s" section (all its fields are optional)',
    async (type) => {
      await expect(validateSectionData(type, {})).resolves.toBeDefined();
    },
  );

  it('returns an instance of the type class', async () => {
    const data = await validateSectionData(SectionType.Products, {
      source: 'featured',
    });

    expect(data).toBeInstanceOf(ProductsSectionData);
  });

  it('rejects unknown keys instead of dropping them (typos lose content)', async () => {
    expect(
      await rejection(SectionType.Video, { titel: 'Typo', videoUrl: null }),
    ).toHaveProperty('titel');
  });

  it.each([null, [], 'text', 42])('rejects %p as data', async (data) => {
    expect(await rejection(SectionType.Contact, data)).toEqual({
      data: ['data must be an object'],
    });
  });

  it('names the type and the fields in the error message', async () => {
    await expect(validateSectionData(SectionType.Products, {})).rejects.toThrow(
      /^Invalid "products" section data: source: /,
    );
  });

  describe('products', () => {
    it('requires a source', async () => {
      expect(await rejection(SectionType.Products, {})).toHaveProperty(
        'source',
      );
    });

    it('requires categoryId for source: category', async () => {
      expect(
        await rejection(SectionType.Products, { source: 'category' }),
      ).toHaveProperty('categoryId');
    });

    it.each([undefined, []])(
      'requires productIds for source: selected (got %p)',
      async (productIds) => {
        expect(
          await rejection(SectionType.Products, {
            source: 'selected',
            productIds,
          }),
        ).toHaveProperty('productIds');
      },
    );

    it('ignores categoryId and productIds for the other sources', async () => {
      await expect(
        validateSectionData(SectionType.Products, {
          source: 'featured',
          categoryId: 'not checked',
        }),
      ).resolves.toBeDefined();
    });

    it.each([
      ['source', { source: 'Featured' }],
      ['layout', { source: 'featured', layout: 'list' }],
      ['anchorId', { source: 'featured', anchorId: '1st section' }],
      ['className', { source: 'featured', className: 'a;b' }],
      ['productIds', { source: 'selected', productIds: [ID, 'nope'] }],
    ])('rejects an invalid %s', async (field, data) => {
      expect(await rejection(SectionType.Products, data)).toHaveProperty(field);
    });
  });

  it.each([
    [SectionType.ImageBanner, { backgroundColor: 'red' }, 'backgroundColor'],
    [SectionType.ImageBanner, { imageId: 'nope' }, 'imageId'],
    [SectionType.Video, { videoUrl: 'http://youtube.com/x' }, 'videoUrl'],
    [SectionType.Video, { videoUrl: '/videos/x.mp4' }, 'videoUrl'],
    [SectionType.News, { layout: 'grid' }, 'layout'],
    [SectionType.Contact, { showForm: 'yes' }, 'showForm'],
    [SectionType.ImageGallery, { imageIds: [ID, 'nope'] }, 'imageIds'],
    [SectionType.Content, { button: { text: 'Go' } }, 'button.url'],
    [SectionType.Benefits, { items: [{ iconId: 'nope' }] }, 'items.0.iconId'],
    [SectionType.Articles, { items: [{ extra: 1 }] }, 'items.0.extra'],
    [SectionType.Promo, { title: 'x'.repeat(256) }, 'title'],
  ])('%s: rejects %j (field %s)', async (type, data, field) => {
    expect(await rejection(type, data)).toHaveProperty([field]);
  });
});
