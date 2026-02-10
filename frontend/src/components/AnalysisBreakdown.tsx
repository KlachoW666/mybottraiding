/**
 * Компонент детального breakdown анализа — стакан, лента, свечи, прогноз
 */

export interface AnalysisBreakdown {
  orderBook: {
    direction: string;
    score: number;
    domScore: number;
    imbalance: number;
    spreadPct: number;
    wallsBid: number;
    wallsAsk: number;
  };
  tape: {
    direction: string;
    score: number;
    delta: number;
    cvdDivergence: 'bullish' | 'bearish' | null;
  };
  candles: {
    direction: string;
    score: number;
    patterns: string[];
    rsi: number | null;
    emaTrend: 'bullish' | 'bearish' | null;
  };
  confluence: {
    count: number;
    direction: string | null;
    confidence: number;
  };
  forecast: {
    direction: 'LONG' | 'SHORT' | null;
    confidence: number;
    reason: string;
  };
  multiTF?: {
    '1m'?: { direction: string; score: number };
    '5m'?: { direction: string; score: number };
    '15m'?: { direction: string; score: number };
    '1h'?: { direction: string; score: number };
    '4h'?: { direction: string; score: number };
    '1d'?: { direction: string; score: number };
    alignCount: number;
  };
  tapeWindows?: Record<string, { direction: string; delta: number }>;
}

function DirBadge({ dir }: { dir: string }) {
  const isLong = dir === 'LONG';
  const isShort = dir === 'SHORT';
  return (
    <span
      className={`text-xs font-bold px-2 py-0.5 rounded ${
        isLong ? 'bg-[var(--success-dim)] text-[var(--success)]' : isShort ? 'bg-[var(--danger-dim)] text-[var(--danger)]' : 'bg-[var(--bg-hover)]'
      }`}
    >
      {dir || '—'}
    </span>
  );
}

export default function AnalysisBreakdown({ data }: { data: AnalysisBreakdown }) {
  if (!data?.forecast || !data?.orderBook || !data?.tape || !data?.candles || !data?.confluence) {
    return null;
  }
  const { orderBook, tape, candles, confluence, forecast, multiTF, tapeWindows } = data;
  const tfOrder = ['1d', '1h', '15m', '5m', '1m'] as const;
  const tapeWinOrder = ['1m', '5m', '15m', '1h'] as const;

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg-card-solid)' }}>
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}>
        <span className="font-semibold text-sm">Прогноз анализа</span>
        <div className="flex items-center gap-2">
          <DirBadge dir={forecast.direction ?? 'NEUTRAL'} />
          <span className="text-sm font-mono" style={{ color: 'var(--accent)' }}>
            {(forecast.confidence * 100).toFixed(0)}%
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-0">
        <div className="p-4 border-b sm:border-b-0 sm:border-r" style={{ borderColor: 'var(--border)' }}>
          <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Стакан (40%)</p>
          <div className="flex items-center gap-2 mb-1">
            <DirBadge dir={orderBook.direction} />
            <span className="text-xs">score {orderBook.score}</span>
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            DOM: {(orderBook.domScore * 100).toFixed(1)}% · Imb: {(orderBook.imbalance * 100).toFixed(1)}%<br />
            Spread: {orderBook.spreadPct.toFixed(3)}% · Walls B/A: {orderBook.wallsBid}/{orderBook.wallsAsk}
          </p>
        </div>
        <div className="p-4 border-b sm:border-b-0 sm:border-r" style={{ borderColor: 'var(--border)' }}>
          <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Лента (35%)</p>
          <div className="flex items-center gap-2 mb-1">
            <DirBadge dir={tape.direction} />
            <span className="text-xs">Δ {(tape.delta * 100).toFixed(1)}%</span>
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {tape.cvdDivergence ? (
              <span className={tape.cvdDivergence === 'bullish' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
                CVD {tape.cvdDivergence}
              </span>
            ) : (
              'CVD ок'
            )}
          </p>
          {tapeWindows && Object.keys(tapeWindows).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {tapeWinOrder.map((w) => {
                const r = tapeWindows[w];
                if (!r) return null;
                return (
                  <span key={w} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-hover)' }}>
                    {w}: {r.direction} (Δ{(r.delta * 100).toFixed(0)}%)
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="p-4" style={{ borderColor: 'var(--border)' }}>
          <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Свечи (25%)</p>
          <div className="flex items-center gap-2 mb-1">
            <DirBadge dir={candles.direction} />
            {candles.rsi != null && <span className="text-xs">RSI {candles.rsi.toFixed(0)}</span>}
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {candles.patterns.length ? candles.patterns.slice(0, 2).join(', ') : '—'}
            {candles.emaTrend && ` · EMA ${candles.emaTrend}`}
          </p>
        </div>
      </div>
      {multiTF && Object.keys(multiTF).filter((k) => k !== 'alignCount').length > 0 && (
        <div className="px-4 py-3 border-t flex flex-wrap gap-2 items-center" style={{ borderColor: 'var(--border)' }}>
          <span className="text-[10px] uppercase tracking-wider shrink-0" style={{ color: 'var(--text-muted)' }}>Multi-TF (1d→1m):</span>
          {tfOrder.map((tf) => {
            const r = multiTF[tf];
            if (!r) return null;
            const align = r.direction === forecast.direction;
            return (
              <span
                key={tf}
                className={`text-[11px] px-2 py-0.5 rounded font-medium ${align ? 'bg-[var(--accent-dim)] text-[var(--accent)]' : 'opacity-70'}`}
              >
                {tf}: {r.direction}
              </span>
            );
          })}
          <span className="text-xs font-semibold ml-1" style={{ color: 'var(--accent)' }}>
            {multiTF.alignCount}/6 ✓
          </span>
        </div>
      )}
      <div className="px-4 py-2 border-t text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        Confluence: {confluence.count}/3 в {confluence.direction ?? '—'} · {forecast.reason}
      </div>
    </div>
  );
}
