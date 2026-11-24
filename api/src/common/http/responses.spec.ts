import { paginate, toSkipTake } from './responses';

describe('toSkipTake', () => {
  it.each([
    [1, 20, 0, 20],
    [2, 20, 20, 20],
    [3, 10, 20, 10],
  ])(
    'page %i, pageSize %i -> skip %i, take %i',
    (page, pageSize, skip, take) => {
      expect(toSkipTake({ page, pageSize })).toEqual({ skip, take });
    },
  );
});

describe('paginate', () => {
  it('wraps the items and computes the page count', () => {
    expect(paginate(['a', 'b'], 41, { page: 3, pageSize: 20 })).toEqual({
      data: ['a', 'b'],
      meta: { page: 3, pageSize: 20, total: 41, pageCount: 3 },
    });
  });

  it.each([
    [0, 0],
    [1, 1],
    [20, 1],
    [21, 2],
    [100, 5],
  ])('total %i with pageSize 20 -> %i pages', (total, pageCount) => {
    expect(paginate([], total, { page: 1, pageSize: 20 }).meta.pageCount).toBe(
      pageCount,
    );
  });

  it('keeps a page beyond the last one as an empty page', () => {
    expect(paginate([], 5, { page: 9, pageSize: 20 })).toEqual({
      data: [],
      meta: { page: 9, pageSize: 20, total: 5, pageCount: 1 },
    });
  });
});
