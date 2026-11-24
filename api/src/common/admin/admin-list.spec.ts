import { ILike, QueryFailedError } from 'typeorm';
import { adminOrder, contains, uniqueViolation } from './admin-list';

describe('admin list helpers', () => {
  describe('adminOrder', () => {
    it('sorts by the column, then by id in the same direction', () => {
      expect(adminOrder('title', 'DESC')).toEqual({
        title: 'DESC',
        id: 'DESC',
      });
      expect(Object.keys(adminOrder('price', 'ASC'))).toEqual(['price', 'id']);
    });

    it('sorts by id alone when asked to', () => {
      expect(adminOrder('id', 'ASC')).toEqual({ id: 'ASC' });
    });
  });

  describe('contains', () => {
    it.each([
      ['борщ', '%борщ%'],
      ['100%', '%100\\%%'],
      ['a_b', '%a\\_b%'],
      ['back\\slash', '%back\\\\slash%'],
    ])('matches %j literally', (text, pattern) => {
      expect(contains(text)).toEqual(ILike(pattern));
    });
  });

  describe('uniqueViolation', () => {
    const duplicate = (constraint: string, code = '23505') =>
      new QueryFailedError(
        'INSERT …',
        [],
        Object.assign(new Error('dup'), { code, constraint }),
      );
    const UNIQUE = { UQ_product_slug: { field: 'slug', code: 'SLUG_TAKEN' } };

    it('turns a known duplicate into a 409 naming the field', () => {
      const error = uniqueViolation(duplicate('UQ_product_slug'), UNIQUE);

      expect(error?.getStatus()).toBe(409);
      expect(error?.getResponse()).toEqual({
        message: 'This slug is already in use',
        code: 'SLUG_TAKEN',
        details: [{ field: 'slug', messages: ['slug is already in use'] }],
      });
    });

    it.each([
      ['another constraint', duplicate('UQ_other')],
      ['another database error', duplicate('UQ_product_slug', '23503')],
      ['not a database error', new Error('boom')],
    ])('leaves %s alone', (_, error) => {
      expect(uniqueViolation(error, UNIQUE)).toBeNull();
    });
  });
});
