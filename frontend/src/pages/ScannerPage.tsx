/**
 * Scanner Dashboard — топ монет по волатильности/объёму, уровни, пробои
 */

import { useState, useEffect } from 'react';
import { api } from '../utils/api';

interface CoinScore {
  symbol: string;
  score: number;
  volume24h?: number;
  volatility24h?: number;
  [key: string]: unknown;
}

interface FullAnalysisItem {
  coin: CoinScore;
  levelsCount: number;
  topLevels: { price: number; type: string; strength: number }[];
  nearestLevel: { price: number; type: string } | null;
  breakout: {
    direction: string;
    confidence: number;
    level: { price: number };
    entryZone: { optimal: number };
  } | null;
}

export default function ScannerPage() {
  const [topCoins, setTopCoins] = useState<CoinScore[]>([]);
  const [analysis, setAnalysis] = useState<FullAnalysisItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [limit, setLimit] = useState(10);

  const fetchTop = () => {
    setLoading(true);
    api
      .get<{ coins: CoinScore[] }>(`/scanner/top?limit=${limit}`)
      .then((data) => setTopCoins(data.coins || []))
      .catch(() => setTopCoins([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTop();
    const t = setInterval(fetchTop, 60_000);
    return () => clearInterval(t);
  }, [limit]);

  const runFullAnalysis = () => {
    setAnalyzing(true);
    setAnalysis([]);
    api
      .post<{ analysis: FullAnalysisItem[] }>('/scanner/full-analysis', { topN: Math.min(limit, 5) })
      .then((data) => setAnalysis(data.analysis || []))
      .catch(() => {})
      .finally(() => setAnalyzing(false));
  };

  const symbolForChart = (s: string) => (s || '').replace(/\//g, '-').replace(/:USDT$/i, '');
  const goToChart = (symbol: string) => {
    const p = symbolForChart(symbol);
    if ((window as any).__navigateTo) {
      (window as any).__navigateTo('chart');
      setTimeout(() => {
        const inp = document.querySelector('input[placeholder*="BTC"]') as HTMLInputElement;
        if (inp) inp.value = p;
      }, 100);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="card p-6">
        <h2 className="text-xl font-semibold mb-4">Скринер — топ монет</h2>
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <label className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Топ</span>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="rounded border px-2 py-1 text-sm"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              {[5, 10, 15, 20].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={fetchTop} disabled={loading} className="btn-secondary text-sm">
            Обновить
          </button>
          <button type="button" onClick={runFullAnalysis} disabled={analyzing} className="btn-primary text-sm">
            {analyzing ? 'Анализ…' : 'Полный анализ (топ 5)'}
          </button>
        </div>
        {loading ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderColor: 'var(--border)' }}>
                  <th className="text-left py-2 px-2">Символ</th>
                  <th className="text-right py-2 px-2">Счёт</th>
                  <th className="text-right py-2 px-2">Объём 24h</th>
                  <th className="text-right py-2 px-2">Волатильность</th>
                  <th className="text-left py-2 px-2">Действия</th>
                </tr>
              </thead>
              <tbody>
                {topCoins.map((c) => (
                  <tr key={c.symbol} className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-2 px-2 font-medium">{c.symbol}</td>
                    <td className="text-right py-2 px-2">{typeof c.score === 'number' ? c.score.toFixed(1) : '—'}</td>
                    <td className="text-right py-2 px-2">
                      {(c as any).metrics?.volume24h != null ? ((c as any).metrics.volume24h / 1e6).toFixed(1) + 'M' : (c as any).volume24h != null ? ((c as any).volume24h / 1e6).toFixed(1) + 'M' : '—'}
                    </td>
                    <td className="text-right py-2 px-2">
                      {(c as any).metrics?.volatility24h != null ? (c as any).metrics.volatility24h.toFixed(2) + '%' : (c as any).volatility24h != null ? (c as any).volatility24h.toFixed(2) + '%' : '—'}
                    </td>
                    <td className="py-2 px-2">
                      <a
                        href={`/api/scanner/levels/${encodeURIComponent((c.symbol || '').replace(/\//g, '-').replace(/:USDT$/i, ''))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mr-2 text-xs"
                        style={{ color: 'var(--accent)' }}
                      >
                        Уровни
                      </a>
                      <button
                        type="button"
                        onClick={() => goToChart(c.symbol)}
                        className="text-xs"
                        style={{ color: 'var(--accent)' }}
                      >
                        График
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {analysis.length > 0 && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4">Результаты полного анализа</h3>
          <div className="space-y-4">
            {analysis.map((item) => (
              <div
                key={item.coin?.symbol}
                className="rounded-lg border p-4"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{item.coin?.symbol}</span>
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Уровней: {item.levelsCount} • Ближайший: {item.nearestLevel ? item.nearestLevel.price : '—'}
                  </span>
                </div>
                {item.breakout && (
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className={
                        item.breakout.direction === 'LONG'
                          ? 'text-green-500'
                          : 'text-red-500'
                      }
                    >
                      Пробой {item.breakout.direction} ({(item.breakout.confidence * 100).toFixed(0)}%)
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      Уровень {item.breakout.level?.price} → вход {item.breakout.entryZone?.optimal}
                    </span>
                  </div>
                )}
                {!item.breakout && item.nearestLevel && (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Пробой не обнаружен у ближайшего уровня {item.nearestLevel.price}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => goToChart(item.coin?.symbol || '')}
                  className="mt-2 text-sm"
                  style={{ color: 'var(--accent)' }}
                >
                  Открыть график / анализ
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
