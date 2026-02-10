/**
 * Centralized API client — consistent fetch, error handling, base URL.
 */

const API_BASE = '/api';

export interface ApiError {
  error: string;
  stack?: string;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({})) as T & ApiError;
  if (!res.ok) {
    const msg = (data as ApiError).error || res.statusText || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export const api = {
  async get<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers }
    });
    return handleResponse<T>(res);
  },

  async post<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      body: body != null ? JSON.stringify(body) : (options?.body ?? undefined)
    });
    return handleResponse<T>(res);
  },

  async patch<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      body: body != null ? JSON.stringify(body) : (options?.body ?? undefined)
    });
    return handleResponse<T>(res);
  }
};
