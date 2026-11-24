import type { DataProvider, Identifier, RaRecord } from 'react-admin';
import { apiFetch } from './http';

/*
 * react-admin <-> /api/admin/<resource>. Resource names are the API's paths
 * (products, page-sections, ...). Lists send ?page=&pageSize=&sort=&order=
 * plus the filters; answers are { data, meta }.
 *
 * Exceptions:
 * - media: read at /admin/media, but uploaded, edited and deleted through
 *   /api/media (MediaService);
 * - settings: one record (id 1) at /admin/settings.
 */

/** A list answer. Records are the API's JSON: react-admin types them per screen. */
interface Page {
  data: any[];
  meta: { total: number };
}

/** Fields the API computes: never sent back. */
const READ_ONLY = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'image',
  'state',
  'sectionCount',
  'itemCount',
  'references',
  'nextStatuses',
  'items',
  'handledAt',
  'emailVerified',
  'url',
  'formats',
  'width',
  'height',
  'mime',
  'size',
  'name',
]);

/** Per resource, the fields an edit may send (others are never diffed in). */
const WRITABLE: Record<string, readonly string[] | undefined> = {
  media: ['alt', 'folder'],
  'contact-messages': ['handled'],
  users: ['role', 'blocked'],
  'page-sections': ['data'],
};

export function queryString(params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      query.append(key, String(item));
    }
  }
  return query.toString();
}

/** The fields of `data` that differ from `previous` and may be written. */
export function changedFields(
  resource: string,
  data: Record<string, unknown>,
  previous: Record<string, unknown>,
): Record<string, unknown> {
  const writable = WRITABLE[resource];
  return Object.fromEntries(
    Object.entries(data).filter(
      ([key, value]) =>
        (writable ? writable.includes(key) : !READ_ONLY.has(key)) &&
        JSON.stringify(value) !== JSON.stringify(previous[key]),
    ),
  );
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

/** The id react-admin uses for the one settings record. */
export const SETTINGS_ID = 1;

export const dataProvider: DataProvider = {
  async getList(resource, { pagination, sort, filter }) {
    const res = await apiFetch<Page>(
      `/admin/${resource}?${queryString({
        page: pagination?.page,
        pageSize: pagination?.perPage,
        sort: sort?.field,
        order: sort?.order,
        ...filter,
      })}`,
    );
    return { data: res.data, total: res.meta.total };
  },

  async getOne(resource, { id }) {
    const path =
      resource === 'settings' ? '/admin/settings' : `/admin/${resource}/${id}`;
    return apiFetch(path);
  },

  async getMany(resource, { ids }) {
    if (!ids.length) return { data: [] };
    const res = await apiFetch<Page>(
      `/admin/${resource}?${queryString({ id: ids, pageSize: 100 })}`,
    );
    return { data: res.data };
  },

  async getManyReference(resource, { target, id, pagination, sort, filter }) {
    return this.getList(resource, {
      pagination,
      sort,
      filter: { ...filter, [target]: id },
    });
  },

  async create(resource, { data }) {
    if (resource === 'media') {
      const form = new FormData();
      const { file, alt, folder } = data as {
        file?: { rawFile?: File } | File;
        alt?: string;
        folder?: string;
      };
      const raw = file instanceof File ? file : file?.rawFile;
      if (raw) form.append('file', raw);
      if (alt) form.append('alt', alt);
      if (folder) form.append('folder', folder);
      return apiFetch('/media', { method: 'POST', body: form });
    }
    return apiFetch(`/admin/${resource}`, json('POST', data));
  },

  async update(resource, { id, data, previousData }) {
    const changes = changedFields(resource, data, previousData);
    if (!Object.keys(changes).length) return { data: previousData };
    if (resource === 'settings') {
      return apiFetch('/admin/settings', json('PATCH', changes));
    }
    const path =
      resource === 'media' ? `/media/${id}` : `/admin/${resource}/${id}`;
    const res = await apiFetch<{ data: RaRecord }>(
      path,
      json('PATCH', changes),
    );
    // /api/media answers with the public shape: keep the admin fields.
    return { data: { ...previousData, ...res.data } };
  },

  async updateMany(resource, { ids, data }) {
    for (const id of ids) {
      await apiFetch(`/admin/${resource}/${id}`, json('PATCH', data));
    }
    return { data: ids };
  },

  async delete(resource, { id, previousData }) {
    const path =
      resource === 'media' ? `/media/${id}` : `/admin/${resource}/${id}`;
    await apiFetch(path, { method: 'DELETE' });
    return { data: (previousData ?? { id }) as never };
  },

  async deleteMany(resource, { ids }) {
    for (const id of ids) {
      await this.delete(resource, { id, previousData: { id } as never });
    }
    return { data: ids };
  },
};

/** The calls that aren't CRUD, for the screens that need them. */
export const adminActions = {
  changeOrderStatus: (id: Identifier, status: string) =>
    apiFetch<{ data: RaRecord }>(
      `/admin/orders/${id}/status`,
      json('POST', { status }),
    ),
  reorderSections: (pageId: Identifier, ids: Identifier[]) =>
    apiFetch(`/admin/pages/${pageId}/sections/order`, json('PUT', { ids })),
  reorderMenuItems: (menuId: Identifier, group: string, ids: Identifier[]) =>
    apiFetch(`/admin/menus/${menuId}/items/order`, json('PUT', { group, ids })),
  sendPasswordReset: (userId: Identifier) =>
    apiFetch(`/admin/users/${userId}/password-reset`, { method: 'POST' }),
  dashboard: () => apiFetch<{ data: Dashboard }>('/admin/dashboard'),
};

export interface Dashboard {
  ordersByStatus: Record<
    'new' | 'processing' | 'declined' | 'completed',
    number
  >;
  ordersToday: number;
  ordersLast7Days: number;
  unhandledMessages: number;
  latestOrders: {
    id: string;
    number: number;
    name: string;
    status: string;
    subtotal: number;
    createdAt: string;
  }[];
}
