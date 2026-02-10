import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API = '/api';
const TOKEN_KEY = 'cryptosignal-auth-token';

const DEFAULT_ALLOWED_TABS = ['dashboard', 'settings', 'activate'];

export interface AuthUser {
  id: string;
  username: string;
  groupId: number;
  groupName?: string;
  allowedTabs: string[];
  proxyUrl?: string;
  activationExpiresAt?: string | null;
  activationActive?: boolean;
}

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  updateProxy: (proxyUrl: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${t}` } });
      if (res.ok) {
        const data = await res.json();
        setUser({
          id: data.id,
          username: data.username,
          groupId: data.groupId,
          groupName: data.groupName,
          allowedTabs: Array.isArray(data.allowedTabs) && data.allowedTabs.length > 0 ? data.allowedTabs : DEFAULT_ALLOWED_TABS,
          proxyUrl: data.proxyUrl,
          activationExpiresAt: data.activationExpiresAt ?? null,
          activationActive: !!data.activationActive
        });
        setToken(t);
      } else {
        setToken(null);
        setUser(null);
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch {
      setToken(null);
      setUser(null);
      localStorage.removeItem(TOKEN_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.token && data.user) {
        localStorage.setItem(TOKEN_KEY, data.token);
        setToken(data.token);
        setUser({
          id: data.user.id,
          username: data.user.username,
          groupId: data.user.groupId,
          groupName: data.user.groupName,
          allowedTabs: Array.isArray(data.user.allowedTabs) && data.user.allowedTabs.length > 0 ? data.user.allowedTabs : DEFAULT_ALLOWED_TABS,
          proxyUrl: data.user.proxyUrl,
          activationExpiresAt: data.user.activationExpiresAt ?? null,
          activationActive: !!data.user.activationActive
        });
        return { ok: true };
      }
      return { ok: false, error: data.error || 'Ошибка входа' };
    } catch (e) {
      return { ok: false, error: (e as Error).message || 'Ошибка сети' };
    }
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.token && data.user) {
        localStorage.setItem(TOKEN_KEY, data.token);
        setToken(data.token);
        setUser({
          id: data.user.id,
          username: data.user.username,
          groupId: data.user.groupId,
          groupName: data.user.groupName,
          allowedTabs: Array.isArray(data.user.allowedTabs) && data.user.allowedTabs.length > 0 ? data.user.allowedTabs : DEFAULT_ALLOWED_TABS,
          proxyUrl: data.user.proxyUrl,
          activationExpiresAt: data.user.activationExpiresAt ?? null,
          activationActive: !!data.user.activationActive
        });
        return { ok: true };
      }
      return { ok: false, error: data.error || 'Ошибка регистрации' };
    } catch (e) {
      return { ok: false, error: (e as Error).message || 'Ошибка сети' };
    }
  }, []);

  const logout = useCallback(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) {
      fetch(`${API}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${t}` } }).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const updateProxy = useCallback(async (proxyUrl: string | null) => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t) return;
    try {
      const res = await fetch(`${API}/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ proxyUrl: proxyUrl || '' })
      });
      if (res.ok) {
        const data = await res.json();
        setUser((prev) => prev ? { ...prev, proxyUrl: data.proxyUrl } : null);
      }
    } catch {}
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, loading, login, register, logout, fetchMe, updateProxy }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
