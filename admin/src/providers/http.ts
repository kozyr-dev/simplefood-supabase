import { HttpError } from 'react-admin';

/*
 * Every call to the API goes through apiFetch(): it adds the access token,
 * refreshes it once on a 401 (one refresh shared by every call waiting),
 * and turns the API's error shape into react-admin's HttpError, with field
 * errors where the form can show them.
 *
 * The access token lives here, in memory only. The refresh token is in an
 * HttpOnly cookie the browser sends to /api/admin/auth by itself; this code
 * never sees it.
 */

export type StaffRole = 'admin' | 'editor';

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
}

interface Session {
  accessToken: string;
  user: StaffUser;
}

interface ApiError {
  error?: {
    status: number;
    code: string;
    message: string;
    details?: { field: string; messages: string[] }[];
  };
}

let session: Session | null = null;
let refreshing: Promise<Session | null> | null = null;

export const currentUser = (): StaffUser | null => session?.user ?? null;

/** For tests: forget everything. */
export function resetSession(): void {
  session = null;
  refreshing = null;
}

async function errorFrom(res: Response): Promise<HttpError> {
  let body: ApiError = {};
  try {
    body = (await res.json()) as ApiError;
  } catch {
    // Not our JSON (a proxy's page): the status says enough.
  }
  const error = body.error;
  const errors = Object.fromEntries(
    (error?.details ?? []).map(({ field, messages }) => [
      field,
      messages.join('; '),
    ]),
  );
  return new HttpError(error?.message ?? res.statusText, res.status, {
    code: error?.code,
    errors,
  });
}

async function authCall(path: string, body?: object): Promise<Response> {
  return fetch(`/api/admin/auth/${path}`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    // The refresh cookie; same origin, so this is fetch's default anyway.
    credentials: 'same-origin',
  });
}

/** Signs in with the email; the refresh cookie arrives with the answer. */
export async function login(
  email: string,
  password: string,
): Promise<StaffUser> {
  const res = await authCall('login', { email, password });
  if (!res.ok) throw await errorFrom(res);
  session = ((await res.json()) as { data: Session }).data;
  return session.user;
}

/**
 * A new access token from the cookie; null when there is no session. Calls
 * made meanwhile wait for the same refresh: a second refresh with the same
 * cookie would count as a stolen token after 10 s.
 */
export function refreshSession(): Promise<Session | null> {
  refreshing ??= (async () => {
    try {
      const res = await authCall('refresh');
      session = res.ok ? ((await res.json()) as { data: Session }).data : null;
      return session;
    } catch {
      session = null;
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function logout(): Promise<void> {
  session = null;
  await authCall('logout').catch(() => undefined);
}

/**
 * `path` is under /api. JSON in and out (or FormData in). A 401 refreshes
 * the session once and retries; still 401 means signed out.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const send = () => {
    const headers = new Headers(init.headers);
    // FormData sets its own multipart type, with the boundary.
    if (init.body && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    if (session) headers.set('Authorization', `Bearer ${session.accessToken}`);
    return fetch(`/api${path}`, { ...init, headers });
  };

  let res = await send();
  if (res.status === 401 && (await refreshSession())) {
    res = await send();
  }
  if (!res.ok) throw await errorFrom(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}
