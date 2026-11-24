import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { bearer } from './auth';

/** A record as the admin API returns it. */
export interface AdminRow {
  id: string;
  [key: string]: unknown;
}

/**
 * Calls to /api/admin/<path> with `token`:
 * `const admin = adminApi(app, accessToken); await admin.get('products')`.
 */
export function adminApi(app: INestApplication<App>, token: string) {
  const http = () => request(app.getHttpServer());
  const url = (path: string) => `/api/admin/${path}`;
  return {
    get: (path: string) => http().get(url(path)).set(bearer(token)),
    post: (path: string, body: object = {}) =>
      http().post(url(path)).set(bearer(token)).send(body),
    patch: (path: string, body: object) =>
      http().patch(url(path)).set(bearer(token)).send(body),
    put: (path: string, body: object) =>
      http().put(url(path)).set(bearer(token)).send(body),
    del: (path: string) => http().delete(url(path)).set(bearer(token)),
  };
}

/** `data` of a list response. */
export const rowsOf = (res: request.Response) =>
  (res.body as { data: AdminRow[] }).data;

/** `data` of a one-record response. */
export const dataOf = (res: request.Response) =>
  (res.body as { data: AdminRow }).data;

/** `error` of an error response. */
export const errorOf = (res: request.Response) =>
  (
    res.body as {
      error: {
        code: string;
        message: string;
        details?: { field: string; messages: string[] }[];
      };
    }
  ).error;
