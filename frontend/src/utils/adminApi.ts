/**
 * API админ-панели с токеном.
 */

const API_BASE = '/api';

const STORAGE_KEY = 'admin_token';

export function getAdminToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch {}
}

export function clearAdminToken(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function isAdminAuthenticated(): boolean {
  return !!getAdminToken();
}

function headers(): HeadersInit {
  const token = getAdminToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'X-Admin-Token': token } : {})
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({})) as T & { error?: string };
  if (res.status === 401) {
    clearAdminToken();
  }
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || res.statusText || `HTTP ${res.status}`);
  }
  return data;
}

export const adminApi = {
  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: headers(),
      body: body != null ? JSON.stringify(body) : undefined
    });
    return handleResponse<T>(res);
  },

  async put<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'PUT',
      headers: headers(),
      body: body != null ? JSON.stringify(body) : undefined
    });
    return handleResponse<T>(res);
  },

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, { headers: headers() });
    return handleResponse<T>(res);
  }
};
