import { useState, useEffect } from 'react';
import { getSettings, updateSettings, type Settings } from '../store/settingsStore';
import { useAuth } from '../contexts/AuthContext';

type SettingsTab = 'connections' | 'analysis' | 'notifications' | 'display' | 'risk';

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'connections', label: 'Подключения', icon: '🔌' },
  { id: 'analysis', label: 'Анализ', icon: '📊' },
  { id: 'notifications', label: 'Уведомления', icon: '🔔' },
  { id: 'display', label: 'Отображение', icon: '🎨' },
  { id: 'risk', label: 'Риски', icon: '⚠️' }
];

const API = '/api';

export default function SettingsPage() {
  const { user, updateProxy } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('connections');
  const [settings, setSettings] = useState<Settings>(getSettings);
  const [connStatus, setConnStatus] = useState<Record<string, { ok?: boolean; msg?: string; checking?: boolean }>>({});
  const [tgTestStatus, setTgTestStatus] = useState<{ ok?: boolean; msg?: string; testing?: boolean }>({});

  useEffect(() => {
    const s = getSettings();
    if (user?.proxyUrl !== undefined && s.connections.proxy !== user.proxyUrl) {
      updateSettings({ connections: { ...s.connections, proxy: user.proxyUrl ?? '' } });
    }
    setSettings(getSettings());
  }, [user?.proxyUrl]);

  const update = (partial: Partial<Settings>) => {
    updateSettings(partial);
    setSettings(getSettings());
  };

  const save = () => {
    updateSettings(settings);
  };

  const reset = () => {
    setSettings(getSettings());
  };

  const checkConnection = async () => {
    setConnStatus((s) => ({ ...s, okx: { checking: true } }));
    try {
      const conn = settings.connections.okx;
      const proxy = (settings.connections.proxy ?? user?.proxyUrl ?? '').trim() || undefined;
      const res = await fetch(`${API}/connections/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exchange: 'OKX',
          apiKey: conn.apiKey,
          apiSecret: conn.apiSecret,
          passphrase: conn.passphrase,
          proxy
        })
      });
      const data = await res.json();
      setConnStatus((s) => ({ ...s, okx: { ok: data.ok, msg: data.message } }));
    } catch (e: any) {
      setConnStatus((s) => ({ ...s, okx: { ok: false, msg: e?.message || 'Ошибка сети' } }));
    }
  };

  const testTelegram = async () => {
    const tg = settings.notifications.telegram;
    if (!tg?.botToken?.trim() || !tg?.chatId?.trim()) {
      setTgTestStatus({ ok: false, msg: 'Введите токен и Chat ID' });
      return;
    }
    setTgTestStatus({ testing: true });
    try {
      const res = await fetch(`${API}/notify/telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: tg.botToken,
          chatId: tg.chatId,
          message: '✅ <b>CryptoSignal Pro</b>\nТестовое уведомление — всё работает!'
        })
      });
      const data = await res.json().catch(() => ({}));
      setTgTestStatus({ ok: data?.ok, msg: data?.ok ? 'Отправлено!' : (data?.error || 'Ошибка') });
    } catch (e: any) {
      setTgTestStatus({ ok: false, msg: e?.message || 'Ошибка сети' });
    }
  };

  const testPublicApi = async () => {
    setConnStatus((s) => ({ ...s, public_okx: { checking: true } }));
    try {
      const res = await fetch(`${API}/connections/test-public`);
      const data = await res.json();
      setConnStatus((s) => ({ ...s, public_okx: { ok: data.ok, msg: data.message } }));
    } catch (e: any) {
      setConnStatus((s) => ({ ...s, public_okx: { ok: false, msg: e?.message || 'Ошибка' } }));
    }
  };

  return (
    <div className="flex gap-6 flex-col lg:flex-row max-w-5xl mx-auto">
      <aside className="w-full lg:w-56 shrink-0">
        <nav className="card p-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                activeTab === t.id
                  ? 'btn-primary text-white'
                  : 'rounded-[10px] px-4 py-2 text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex-1 space-y-6">
        {activeTab === 'connections' && (
          <section className="card p-6 md:p-8">
            <h2 className="text-lg font-semibold mb-5 tracking-tight">Подключения к биржам</h2>
            {/* Sovereignty Check (generate-complete-guide, Antonopoulos): "Не ваши ключи — не ваши монеты" */}
            <div className="mb-6 p-4 rounded-xl border" style={{ borderColor: 'var(--accent)', background: 'var(--accent-dim)' }}>
              <p className="text-sm font-medium mb-1">Sovereignty Check (Antonopoulos)</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                API ключи — только права «Trading». Отключите «Withdraw» (вывод средств) на бирже. Храните ключи в .env, не в коде.
              </p>
            </div>
            <div className="space-y-6">
              <div className="card p-5 md:p-6">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-medium">OKX</span>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.connections.okx.enabled}
                      onChange={(e) => update({ connections: { ...settings.connections, okx: { ...settings.connections.okx, enabled: e.target.checked } } })}
                      className="rounded"
                    />
                    <span className="text-sm">Включено</span>
                  </label>
                </div>
                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Ключи из .env используются автоматически. Можно переопределить здесь.</p>
                <div className="space-y-2 text-sm">
                  <div>
                    <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>API Key</label>
                    <input
                      type="password"
                      value={settings.connections.okx.apiKey}
                      onChange={(e) => update({ connections: { ...settings.connections, okx: { ...settings.connections.okx, apiKey: e.target.value } } })}
                      placeholder="Или из .env"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Secret</label>
                    <input
                      type="password"
                      value={settings.connections.okx.apiSecret}
                      onChange={(e) => update({ connections: { ...settings.connections, okx: { ...settings.connections.okx, apiSecret: e.target.value } } })}
                      placeholder="Или из .env"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Passphrase</label>
                    <input
                      type="password"
                      value={settings.connections.okx.passphrase}
                      onChange={(e) => update({ connections: { ...settings.connections, okx: { ...settings.connections.okx, passphrase: e.target.value } } })}
                      placeholder="Задаётся при создании ключа"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Прокси (для каждого пользователя)</label>
                    <input
                      type="text"
                      value={settings.connections.proxy ?? ''}
                      onChange={(e) => update({ connections: { ...settings.connections, proxy: e.target.value } })}
                      onBlur={() => {
                        const v = (settings.connections.proxy ?? '').trim();
                        updateProxy(v || null);
                      }}
                      placeholder="http://user:pass@ip:port"
                      className="input-field"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={checkConnection}
                      disabled={connStatus.okx?.checking}
                      className="text-primary text-sm hover:underline disabled:opacity-50"
                    >
                      {connStatus.okx?.checking ? 'Проверка...' : 'Проверить подключение'}
                    </button>
                    <button
                      onClick={testPublicApi}
                      disabled={connStatus.public_okx?.checking}
                      className="text-sm hover:underline disabled:opacity-50"
                      style={{ color: 'var(--link-color)' }}
                    >
                      {connStatus.public_okx?.checking ? '...' : 'Тест публичного API'}
                    </button>
                  </div>
                  {connStatus.okx?.msg && (
                    <p className={`text-sm ${connStatus.okx.ok ? 'text-[var(--primary)]' : 'text-[var(--danger)]'}`}>{connStatus.okx.msg}</p>
                  )}
                  {connStatus.public_okx?.msg && (
                    <p className={`text-sm ${connStatus.public_okx.ok ? 'text-[var(--primary)]' : 'text-[var(--warning)]'}`}>Публичный API: {connStatus.public_okx.msg}</p>
                  )}
                </div>
              </div>
              <div className="card p-5 md:p-6">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-medium">TradingView</span>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.connections.tradingview.enabled}
                      onChange={(e) => update({ connections: { ...settings.connections, tradingview: { ...settings.connections.tradingview, enabled: e.target.checked } } })}
                      className="rounded"
                    />
                    <span className="text-sm">Включено</span>
                  </label>
                </div>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Виджеты используют данные OKX. API ключ не требуется.</p>
              </div>
              <div className="card p-5 md:p-6">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-medium">Scalpboard</span>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.connections.scalpboard.enabled}
                      onChange={(e) => update({ connections: { ...settings.connections, scalpboard: { ...settings.connections.scalpboard, enabled: e.target.checked } } })}
                      className="rounded"
                    />
                    <span className="text-sm">Включено</span>
                  </label>
                </div>
                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                  {!settings.connections.scalpboard.apiKey?.trim()
                    ? 'Введите API ключ для интеграции со Scalpboard.'
                    : 'API ключ указан.'}
                </p>
                <div className="space-y-2 text-sm">
                  <div>
                    <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>API Key</label>
                    <input
                      type="text"
                      value={settings.connections.scalpboard.apiKey}
                      onChange={(e) => update({ connections: { ...settings.connections, scalpboard: { ...settings.connections.scalpboard, apiKey: e.target.value } } })}
                      placeholder="Вставьте ключ с scalpboard.io"
                      className="input-field"
                    />
                  </div>
                  <a href="https://scalpboard.io" target="_blank" rel="noopener noreferrer" className="text-primary text-sm hover:underline">
                    Получить API ключ
                  </a>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'analysis' && (
          <section className="card p-6 md:p-8">
            <h2 className="text-lg font-semibold mb-4">Настройки анализа</h2>
            <div className="space-y-4">
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Таймфрейм по умолчанию</label>
                <select
                  value={settings.analysis.timeframe}
                  onChange={(e) => update({ analysis: { ...settings.analysis, timeframe: e.target.value } })}
                  className="input-field"
                >
                  <option value="1m">1m</option>
                  <option value="5m">5m</option>
                  <option value="15m">15m</option>
                  <option value="1h">1h</option>
                  <option value="4h">4h</option>
                  <option value="1d">1d</option>
                </select>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.analysis.candlePatterns}
                  onChange={(e) => update({ analysis: { ...settings.analysis, candlePatterns: e.target.checked } })}
                  className="rounded"
                />
                <span>Паттерны свечей</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.analysis.orderbookAnalysis}
                  onChange={(e) => update({ analysis: { ...settings.analysis, orderbookAnalysis: e.target.checked } })}
                  className="rounded"
                />
                <span>Анализ стакана ордеров</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.analysis.volumeAnalysis}
                  onChange={(e) => update({ analysis: { ...settings.analysis, volumeAnalysis: e.target.checked } })}
                  className="rounded"
                />
                <span>Анализ объёма</span>
              </label>
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Минимальная уверенность (%)</label>
                <input
                  type="number"
                  value={settings.analysis.minConfidence}
                  onChange={(e) => update({ analysis: { ...settings.analysis, minConfidence: Number(e.target.value) } })}
                  min={50}
                  max={95}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Минимальный R:R</label>
                <input
                  type="number"
                  value={settings.analysis.minRR}
                  onChange={(e) => update({ analysis: { ...settings.analysis, minRR: Number(e.target.value) } })}
                  step={0.5}
                  min={1}
                  className="input-field"
                />
              </div>
            </div>
          </section>
        )}

        {activeTab === 'notifications' && (
          <section className="card p-6 md:p-8">
            <h2 className="text-lg font-semibold mb-4">Уведомления</h2>
            <div className="space-y-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.notifications.desktop}
                  onChange={(e) => update({ notifications: { ...settings.notifications, desktop: e.target.checked } })}
                  className="rounded"
                />
                <span>Уведомления на рабочем столе</span>
                {settings.notifications.desktop && typeof Notification !== 'undefined' && Notification.permission !== 'granted' && (
                  <button type="button" onClick={() => Notification.requestPermission()} className="ml-2 text-xs hover:underline" style={{ color: 'var(--link-color)' }}>Разрешить</button>
                )}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.notifications.sound}
                  onChange={(e) => update({ notifications: { ...settings.notifications, sound: e.target.checked } })}
                  className="rounded"
                />
                <span>Звук</span>
              </label>
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Типы сигналов</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.notifications.long}
                      onChange={(e) => update({ notifications: { ...settings.notifications, long: e.target.checked } })}
                      className="rounded"
                    />
                    <span>LONG</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.notifications.short}
                      onChange={(e) => update({ notifications: { ...settings.notifications, short: e.target.checked } })}
                      className="rounded"
                    />
                    <span>SHORT</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Минимальная уверенность (%)</label>
                <input
                  type="number"
                  value={settings.notifications.minConfidence}
                  onChange={(e) => update({ notifications: { ...settings.notifications, minConfidence: Number(e.target.value) } })}
                  min={50}
                  max={95}
                  className="input-field"
                />
              </div>
              <div className="card p-5 md:p-6">
                <h3 className="font-medium mb-3">Telegram бот</h3>
                <p className="text-[#9CA3AF] text-sm mb-3">Уведомления об открытии и закрытии позиций. Создайте бота через @BotFather.</p>
                <p className="text-amber-400/90 text-xs mb-3">⚠️ Chat ID — это ваш личный ID или ID группы, а не другого бота. Сначала напишите вашему боту /start. Узнать свой ID: @userinfobot или @getidsbot.</p>
                <label className="flex items-center gap-2 mb-3">
                  <input
                    type="checkbox"
                    checked={settings.notifications.telegram?.enabled ?? false}
                    onChange={(e) => update({
                      notifications: {
                        ...settings.notifications,
                        telegram: { ...(settings.notifications.telegram || { enabled: false, botToken: '', chatId: '' }), enabled: e.target.checked }
                      }
                    })}
                    className="rounded"
                  />
                  <span>Включить уведомления</span>
                </label>
                <div className="space-y-2">
                  <div>
                    <label className="text-sm block mb-1" style={{ color: 'var(--text-muted)' }}>Токен бота</label>
                    <input
                      type="password"
                      value={settings.notifications.telegram?.botToken ?? ''}
                      onChange={(e) => update({
                        notifications: {
                          ...settings.notifications,
                          telegram: { ...(settings.notifications.telegram || { enabled: false, botToken: '', chatId: '' }), botToken: e.target.value }
                        }
                      })}
                      placeholder="1234567890:ABCdefGHI..."
                      className="input-field w-full"
                    />
                  </div>
                  <div>
                    <label className="text-sm block mb-1" style={{ color: 'var(--text-muted)' }}>Chat ID</label>
                    <input
                      type="text"
                      value={settings.notifications.telegram?.chatId ?? ''}
                      onChange={(e) => update({
                        notifications: {
                          ...settings.notifications,
                          telegram: { ...(settings.notifications.telegram || { enabled: false, botToken: '', chatId: '' }), chatId: e.target.value }
                        }
                      })}
                      placeholder="123456789 или -1001234567890"
                      className="input-field w-full"
                    />
                  </div>
                  <button
                    onClick={testTelegram}
                    disabled={tgTestStatus.testing || !settings.notifications.telegram?.botToken?.trim() || !settings.notifications.telegram?.chatId?.trim()}
                    className="mt-3 px-4 py-2 rounded-[10px] text-sm disabled:opacity-50"
                    style={{ background: 'rgba(64,221,255,0.2)', color: 'var(--primary)' }}
                  >
                    {tgTestStatus.testing ? 'Отправка...' : 'Отправить тест'}
                  </button>
                  {tgTestStatus.msg && (
                    <p className={`mt-2 text-sm ${tgTestStatus.ok ? 'text-[var(--primary)]' : 'text-[var(--danger)]'}`}>{tgTestStatus.msg}</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'display' && (
          <section className="card p-6 md:p-8">
            <h2 className="text-lg font-semibold mb-4">Отображение</h2>
            <div className="space-y-4">
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Тема</label>
                <select
                  value={settings.display.theme}
                  onChange={(e) => update({ display: { ...settings.display, theme: e.target.value as 'dark' | 'light' } })}
                  className="input-field"
                >
                  <option value="dark">Тёмная</option>
                  <option value="light">Светлая</option>
                </select>
              </div>
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Язык</label>
                <select
                  value={settings.display.language}
                  onChange={(e) => update({ display: { ...settings.display, language: e.target.value as 'ru' | 'en' } })}
                  className="input-field"
                >
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Стиль графика</label>
                <select
                  value={settings.display.chartStyle}
                  onChange={(e) => update({ display: { ...settings.display, chartStyle: e.target.value as 'candles' | 'heikin-ashi' | 'line' } })}
                  className="input-field"
                >
                  <option value="candles">Свечи</option>
                  <option value="heikin-ashi">Heikin-Ashi</option>
                  <option value="line">Линия</option>
                </select>
              </div>
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Стиль стакана</label>
                <select
                  value={settings.display.orderbookStyle}
                  onChange={(e) => update({ display: { ...settings.display, orderbookStyle: e.target.value as 'default' | 'grouped' | 'heatmap' } })}
                  className="input-field"
                >
                  <option value="default">По умолчанию</option>
                  <option value="grouped">Группированный</option>
                  <option value="heatmap">Тепловая карта</option>
                </select>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'risk' && (
          <section className="card p-6 md:p-8">
            <h2 className="text-lg font-semibold mb-4">Риск-менеджмент</h2>
            <div className="space-y-4">
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Макс. размер позиции (% от баланса)</label>
                <input
                  type="number"
                  value={settings.risk.maxPositionPercent}
                  onChange={(e) => update({ risk: { ...settings.risk, maxPositionPercent: Number(e.target.value) } })}
                  min={1}
                  max={100}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Стоп-лосс по умолчанию (%)</label>
                <input
                  type="number"
                  value={settings.risk.defaultStopLoss}
                  onChange={(e) => update({ risk: { ...settings.risk, defaultStopLoss: Number(e.target.value) } })}
                  step={0.1}
                  min={0.5}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Уровни тейк-профита (%)</label>
                <input
                  type="text"
                  value={settings.risk.takeProfitLevels}
                  onChange={(e) => update({ risk: { ...settings.risk, takeProfitLevels: e.target.value } })}
                  placeholder="1, 2, 3"
                  className="input-field"
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.risk.trailingStop}
                  onChange={(e) => update({ risk: { ...settings.risk, trailingStop: e.target.checked } })}
                  className="rounded"
                />
                <span>Трейлинг-стоп</span>
              </label>
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Трейлинг-стоп (%)</label>
                <input
                  type="number"
                  value={settings.risk.trailingStopPercent}
                  onChange={(e) => update({ risk: { ...settings.risk, trailingStopPercent: Number(e.target.value) } })}
                  disabled={!settings.risk.trailingStop}
                  className="input-field"
                />
              </div>
            </div>
          </section>
        )}

        <div className="flex gap-3">
          <button onClick={save} className="btn-primary">Сохранить</button>
          <button onClick={reset} className="btn-secondary">Отмена</button>
        </div>
      </div>
    </div>
  );
}
