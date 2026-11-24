import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { changedFields, dataProvider, queryString } from './dataProvider';
import { resetSession } from './http';

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('dataProvider', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    resetSession();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const call = (index = 0) => {
    const [url, init] = fetchMock.mock.calls[index];
    return {
      url:
        typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
    };
  };

  it('builds the list query: paging, sort, filters; skips empty ones', () => {
    expect(
      queryString({
        page: 2,
        pageSize: 25,
        sort: 'title',
        order: 'DESC',
        q: '',
        categoryId: undefined,
        id: ['a', 'b'],
      }),
    ).toBe('page=2&pageSize=25&sort=title&order=DESC&id=a&id=b');
  });

  it('reads a list as { data, total }', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ data: [{ id: 'p1' }], meta: { total: 7 } }),
    );

    const res = await dataProvider.getList('products', {
      pagination: { page: 1, perPage: 10 },
      sort: { field: 'title', order: 'ASC' },
      filter: { q: 'борщ', available: true },
    });

    expect(res).toEqual({ data: [{ id: 'p1' }], total: 7 });
    expect(call().url).toBe(
      `/api/admin/products?page=1&pageSize=10&sort=title&order=ASC&q=${encodeURIComponent('борщ')}&available=true`,
    );
  });

  it('reads related records by their target field', async () => {
    fetchMock.mockResolvedValueOnce(ok({ data: [], meta: { total: 0 } }));

    await dataProvider.getManyReference('page-sections', {
      target: 'pageId',
      id: 'p1',
      pagination: { page: 1, perPage: 100 },
      sort: { field: 'position', order: 'ASC' },
      filter: {},
    });

    expect(call().url).toContain('pageId=p1');
  });

  it('sends only the changed, writable fields of an edit', async () => {
    fetchMock.mockResolvedValueOnce(ok({ data: { id: 'p1', price: 2000 } }));

    await dataProvider.update('products', {
      id: 'p1',
      data: {
        id: 'p1',
        title: 'Суп',
        price: 2000,
        image: { id: 'i' },
        updatedAt: 'later',
      },
      previousData: {
        id: 'p1',
        title: 'Суп',
        price: 1000,
        image: { id: 'i' },
        updatedAt: 'now',
      },
    });

    expect(call()).toEqual({
      url: '/api/admin/products/p1',
      method: 'PATCH',
      body: { price: 2000 },
    });
  });

  it('skips the call when nothing changed', async () => {
    const previousData = { id: 'p1', title: 'Суп' };

    expect(
      await dataProvider.update('products', {
        id: 'p1',
        data: { ...previousData },
        previousData,
      }),
    ).toEqual({
      data: previousData,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('limits edits of users to role and blocking', () => {
    expect(
      changedFields(
        'users',
        { role: 'editor', email: 'new@example.com', blocked: true },
        { role: 'customer', email: 'old@example.com', blocked: false },
      ),
    ).toEqual({ role: 'editor', blocked: true });
  });

  it('uploads media as multipart to /api/media, edits and deletes it there', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ data: { id: 'm1' } }))
      .mockResolvedValueOnce(ok({ data: { id: 'm1', alt: 'x' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const file = new File(['img'], 'borscht.jpg', { type: 'image/jpeg' });

    await dataProvider.create('media', {
      data: { file: { rawFile: file }, alt: 'Борщ', folder: 'products' },
    });
    await dataProvider.update('media', {
      id: 'm1',
      data: { id: 'm1', alt: 'x', name: 'renamed.jpg' },
      previousData: { id: 'm1', alt: null, name: 'borscht.jpg' },
    });
    await dataProvider.delete('media', {
      id: 'm1',
      previousData: { id: 'm1' },
    });

    const upload = call(0);
    expect(upload.url).toBe('/api/media');
    expect((upload.body as FormData).get('file')).toBeInstanceOf(File);
    expect((upload.body as FormData).get('folder')).toBe('products');
    expect(call(1)).toEqual({
      url: '/api/media/m1',
      method: 'PATCH',
      body: { alt: 'x' },
    });
    expect(call(2)).toMatchObject({ url: '/api/media/m1', method: 'DELETE' });
  });

  it('reads and writes the one settings record', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ data: { id: 1, siteName: 'SF' } }))
      .mockResolvedValueOnce(ok({ data: { id: 1, siteName: 'SimpleFood' } }));

    await dataProvider.getOne('settings', { id: 1 });
    await dataProvider.update('settings', {
      id: 1,
      data: { id: 1, siteName: 'SimpleFood' },
      previousData: { id: 1, siteName: 'SF' },
    });

    expect(call(0).url).toBe('/api/admin/settings');
    expect(call(1)).toEqual({
      url: '/api/admin/settings',
      method: 'PATCH',
      body: { siteName: 'SimpleFood' },
    });
  });
});
