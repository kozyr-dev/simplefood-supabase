import { HttpError } from 'react-admin';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiFetch,
  currentUser,
  login,
  refreshSession,
  resetSession,
} from './http';

const urlOf = (input: RequestInfo | URL) =>
  typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url;

const USER = {
  id: 'u1',
  name: 'Olena',
  email: 'o@example.com',
  role: 'editor',
};

function reply(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const session = (token: string) => ({
  data: { accessToken: token, expiresIn: 900, user: USER },
});

describe('http', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    resetSession();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const urls = () => fetchMock.mock.calls.map(([url]) => urlOf(url));
  const headersOf = (call: number) =>
    new Headers(fetchMock.mock.calls[call][1]?.headers);
  const authHeader = (call: number) => headersOf(call).get('Authorization');

  it('signs in, then sends the access token as a bearer token', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, session('t1')))
      .mockResolvedValueOnce(reply(200, { data: [] }));

    await login('o@example.com', 'secret');
    await apiFetch('/admin/products');

    expect(urls()).toEqual(['/api/admin/auth/login', '/api/admin/products']);
    // Accounts log in by email only.
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      email: 'o@example.com',
      password: 'secret',
    });
    expect(authHeader(1)).toBe('Bearer t1');
    expect(currentUser()).toEqual(USER);
  });

  it('refreshes once on a 401 and retries with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, session('old')))
      .mockResolvedValueOnce(
        reply(401, {
          error: { status: 401, code: 'UNAUTHORIZED', message: 'x' },
        }),
      )
      .mockResolvedValueOnce(reply(200, session('new')))
      .mockResolvedValueOnce(reply(200, { data: 1 }));
    await login('o@example.com', 'secret');

    expect(await apiFetch('/admin/x')).toEqual({ data: 1 });
    expect(urls().slice(1)).toEqual([
      '/api/admin/x',
      '/api/admin/auth/refresh',
      '/api/admin/x',
    ]);
    expect(authHeader(3)).toBe('Bearer new');
  });

  it('shares one refresh between calls that hit a 401 together', async () => {
    let finishRefresh: (r: Response) => void = () => undefined;
    fetchMock.mockImplementation((url) => {
      if (urlOf(url).endsWith('/auth/refresh')) {
        return new Promise<Response>((resolve) => (finishRefresh = resolve));
      }
      const auth = new Headers(fetchMock.mock.lastCall?.[1]?.headers).get(
        'Authorization',
      );
      return Promise.resolve(
        auth ? reply(200, { data: 'ok' }) : reply(401, {}),
      );
    });

    const calls = [
      apiFetch('/admin/a'),
      apiFetch('/admin/b'),
      apiFetch('/admin/c'),
    ];
    await vi.waitFor(() =>
      expect(urls().filter((u) => u.endsWith('/refresh'))).toHaveLength(1),
    );
    finishRefresh(reply(200, session('t')));

    expect(await Promise.all(calls)).toEqual([
      { data: 'ok' },
      { data: 'ok' },
      { data: 'ok' },
    ]);
    expect(urls().filter((u) => u.endsWith('/refresh'))).toHaveLength(1);
  });

  it('gives up when the refresh fails: the 401 reaches react-admin', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(401, {}))
      .mockResolvedValueOnce(reply(401, {}));

    await expect(apiFetch('/admin/x')).rejects.toMatchObject({ status: 401 });
    expect(await refreshSession()).toBeNull();
  });

  it('turns the API error shape into HttpError with field errors', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(400, {
        error: {
          status: 400,
          code: 'BAD_REQUEST',
          message: 'Validation failed',
          details: [
            { field: 'slug', messages: ['slug is already in use'] },
            {
              field: 'data.items.0.title',
              messages: ['too long', 'not a string'],
            },
          ],
        },
      }),
    );

    const error = (await apiFetch('/admin/x').catch(
      (e: unknown) => e,
    )) as HttpError;

    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(400);
    expect(error.message).toBe('Validation failed');
    expect(error.body).toEqual({
      code: 'BAD_REQUEST',
      errors: {
        slug: 'slug is already in use',
        'data.items.0.title': 'too long; not a string',
      },
    });
  });

  it('copes with an error page that is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>Bad gateway</html>', {
        status: 502,
        statusText: 'Bad Gateway',
      }),
    );

    await expect(apiFetch('/admin/x')).rejects.toMatchObject({
      status: 502,
      message: 'Bad Gateway',
    });
  });

  it('sends JSON with a content type, FormData without one', async () => {
    fetchMock.mockResolvedValue(reply(204));

    await apiFetch('/a', { method: 'POST', body: '{}' });
    await apiFetch('/b', { method: 'POST', body: new FormData() });

    expect(headersOf(0).get('Content-Type')).toBe('application/json');
    expect(headersOf(1).get('Content-Type')).toBeNull();
  });
});
