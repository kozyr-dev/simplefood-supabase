import { ArgumentMetadata } from '@nestjs/common';
import { TrimPipe } from './trim.pipe';

describe('TrimPipe', () => {
  const pipe = new TrimPipe();
  const body: ArgumentMetadata = { type: 'body' };

  it('trims strings in nested objects and arrays', () => {
    const value = {
      name: '  Ivan ',
      address: { city: ' Kyiv  ' },
      items: [{ note: ' extra cheese ' }, '  tag  '],
    };

    expect(pipe.transform(value, body)).toEqual({
      name: 'Ivan',
      address: { city: 'Kyiv' },
      items: [{ note: 'extra cheese' }, 'tag'],
    });
  });

  it('leaves password fields untouched, whatever their casing', () => {
    const value = {
      password: '  my secret ',
      passwordConfirmation: ' x ',
      currentPassword: ' y ',
    };

    expect(pipe.transform(value, body)).toEqual({
      password: '  my secret ',
      passwordConfirmation: ' x ',
      currentPassword: ' y ',
    });
  });

  it('trims query objects', () => {
    expect(pipe.transform({ search: ' pizza ' }, { type: 'query' })).toEqual({
      search: 'pizza',
    });
  });

  it('trims a single named body field', () => {
    expect(pipe.transform('  a@b.c ', { type: 'body', data: 'email' })).toBe(
      'a@b.c',
    );
  });

  it('does not trim a single named password field', () => {
    expect(pipe.transform(' p ', { type: 'body', data: 'password' })).toBe(
      ' p ',
    );
  });

  it('ignores route params and custom decorators', () => {
    expect(pipe.transform(' 42 ', { type: 'param', data: 'id' })).toBe(' 42 ');
    expect(pipe.transform(' x ', { type: 'custom' })).toBe(' x ');
  });

  it('keeps non-string values as they are', () => {
    const value = { count: 3, active: true, nothing: null };
    expect(pipe.transform(value, body)).toEqual(value);
  });

  it('never changes the prototype through a "__proto__" key', () => {
    const value = JSON.parse('{"name":" a ","__proto__":{"isAdmin":true}}');

    pipe.transform(value, body);

    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(value.isAdmin).toBeUndefined();
    expect(value.name).toBe('a');
  });
});
