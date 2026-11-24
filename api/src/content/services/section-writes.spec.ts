import { BadRequestException } from '@nestjs/common';
import { SectionType } from '../entities/page-section.entity';
import { prepareSectionData, withoutEmpty } from './section-writes';

const ID = '01a1559c-a1ed-7641-ac0e-64612b99bb5a';

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse();
  }
  throw new Error('expected a 400');
}

describe('withoutEmpty', () => {
  it('drops null, blank strings and empty objects, keeps false, 0 and arrays', () => {
    expect(
      withoutEmpty({
        title: '  Акції ',
        text: '   ',
        imageId: null,
        button: { text: '', url: null },
        showForm: false,
        count: 0,
        items: [{ title: 'a', text: '' }],
      }),
    ).toEqual({
      title: 'Акції',
      showForm: false,
      count: 0,
      items: [{ title: 'a' }],
    });
  });

  it('ignores a __proto__ key', () => {
    const value = withoutEmpty(JSON.parse('{"__proto__": {"x": 1}, "a": 1}'));
    expect(value).toEqual({ a: 1 });
    expect(({} as { x?: number }).x).toBeUndefined();
  });
});

describe('prepareSectionData', () => {
  it('stores what was sent, without empty fields', async () => {
    expect(
      await prepareSectionData(SectionType.Products, {
        title: 'Хіти',
        source: 'selected',
        productIds: [ID],
        anchorId: '',
        categoryId: null,
      }),
    ).toEqual({ title: 'Хіти', source: 'selected', productIds: [ID] });
  });

  it('answers invalid data with 400, fields named under data.', async () => {
    expect(
      await errorOf(
        prepareSectionData(SectionType.Benefits, {
          items: [{ title: 'x'.repeat(300) }],
          bogus: 1,
        }),
      ),
    ).toEqual({
      message: 'Validation failed',
      details: expect.arrayContaining([
        { field: 'data.bogus', messages: ['property bogus should not exist'] },
        expect.objectContaining({ field: 'data.items.0.title' }),
      ]),
    });
  });

  it('cleans the HTML fields the site renders as HTML', async () => {
    expect(
      await prepareSectionData(SectionType.Contact, {
        content: '<p onclick="x()">Адреса</p><script>x()</script>',
        secondaryContent: '<script>only a script</script>',
      }),
    ).toEqual({ content: '<p>Адреса</p>' });
  });

  it('leaves markdown fields as they are', async () => {
    const text = '**Нове** меню <b>тут</b>';
    expect(await prepareSectionData(SectionType.Promo, { text })).toEqual({
      text,
    });
  });

  it('keeps an allowed map iframe and drops the rest of the embed code', async () => {
    expect(
      await prepareSectionData(SectionType.Contact, {
        mapEmbedCode:
          '<iframe src="https://www.google.com/maps/embed?pb=1" onload="x()"></iframe><script>x()</script>',
      }),
    ).toEqual({
      mapEmbedCode:
        '<iframe src="https://www.google.com/maps/embed?pb=1"></iframe>',
    });
  });

  it('refuses an embed code with no allowed iframe', async () => {
    expect(
      await errorOf(
        prepareSectionData(SectionType.Content, {
          embedCode: '<iframe src="https://evil.example/x"></iframe>',
        }),
      ),
    ).toEqual({
      message: 'Validation failed',
      details: [
        {
          field: 'data.embedCode',
          messages: [
            'data.embedCode must be an iframe (https) from Google Maps, YouTube or Vimeo',
          ],
        },
      ],
    });
  });
});
