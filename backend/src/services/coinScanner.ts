/**
 * Coin Scanner - автоматический отбор монет для скальпинга
 * Основан на уроке 10: "Как отбирать монеты на пробой уровня (скринер)"
 *
 * Критерии отбора:
 * - Волатильность > 5% за 24ч
 * - Объём > $1M за 24ч
 * - BB Squeeze (сужение полос Боллинджера)
 * - Приближение к ключевому уровню
 * - Funding Rate (опционально)
 */

import { DataAggregator } from './dataAggregator';
import { CandleAnalyzer } from './candleAnalyzer';
import { logger } from '../lib/logger';

export interface ScanCriteria {
  minVolume24h: number;      // мин. объём за 24ч (USDT)
  minVolatility24h: number;  // мин. волатильность за 24ч (%)
  checkBBSqueeze: boolean;   // проверять сужение BB
  checkMomentum: boolean;    // проверять импульс (EMA alignment)
}

export interface CoinScore {
  symbol: string;
  score: number;
  rank: number;              // место в рейтинге
  reasons: string[];         // причины высокого скора
  metrics: {
    volume24h: number;
    volatility24h: number;
    priceChange24h: number;  // изменение цены %
    bbSqueezeStrength: number; // 0-1, где 1 = сильное сужение
    emaAlignment: boolean;   // EMA(9) > EMA(21) > EMA(50)
    rsi: number | null;
    currentPrice: number;
  };
}

const DEFAULT_CRITERIA: ScanCriteria = {
  minVolume24h: 1_000_000,   // $1M
  minVolatility24h: 5,       // 5%
  checkBBSqueeze: true,
  checkMomentum: true
};

/**
 * Scanner для автоматического отбора монет
 * MaksBaks Урок 10: выбираем монеты с высокой волатильностью, объёмом и потенциалом пробоя
 */
export class CoinScanner {
  private dataAgg: DataAggregator;
  private analyzer: CandleAnalyzer;

  constructor() {
    this.dataAgg = new DataAggregator();
    this.analyzer = new CandleAnalyzer();
  }

  /**
   * Быстрое сканирование списка монет
   */
  async quickScan(
    symbols: string[],
    criteria: Partial<ScanCriteria> = {}
  ): Promise<CoinScore[]> {
    const config = { ...DEFAULT_CRITERIA, ...criteria };
    const results: CoinScore[] = [];

    logger.info('CoinScanner', `Scanning ${symbols.length} coins...`);

    for (const symbol of symbols) {
      try {
        const score = await this.scoreSymbol(symbol, config);
        if (score) results.push(score);
      } catch (e) {
        logger.warn('CoinScanner', `Failed to scan ${symbol}`, { error: e });
      }
    }

    // Сортировка по score и добавление rank
    results.sort((a, b) => b.score - a.score);
    results.forEach((r, i) => r.rank = i + 1);

    logger.info('CoinScanner', `Scan complete: ${results.length} coins scored`);
    return results;
  }

  /**
   * Получить топ N кандидатов
   */
  async getTopCandidates(
    symbols: string[],
    limit: number = 10,
    criteria: Partial<ScanCriteria> = {}
  ): Promise<CoinScore[]> {
    const all = await this.quickScan(symbols, criteria);
    return all.slice(0, limit);
  }

  /**
   * Оценка одной монеты по критериям
   */
  private async scoreSymbol(
    symbol: string,
    config: ScanCriteria
  ): Promise<CoinScore | null> {
    // Получаем свечи 15m за последние 24 часа (96 свечей)
    const candles = await this.dataAgg.getOHLCV(symbol, '15m', 100);
    if (candles.length < 50) return null;

    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume ?? 0);
    const candles24h = candles.slice(-96); // последние 24ч

    // === Метрика 1: Объём 24ч ===
    const volume24h = candles24h.reduce((sum, c) => sum + (c.volume ?? 0) * c.close, 0);
    if (volume24h < config.minVolume24h) return null; // фильтр

    // === Метрика 2: Волатильность 24ч ===
    const high24h = Math.max(...candles24h.map(c => c.high));
    const low24h = Math.min(...candles24h.map(c => c.low));
    const volatility24h = ((high24h - low24h) / low24h) * 100;
    if (volatility24h < config.minVolatility24h) return null; // фильтр

    // === Метрика 3: Изменение цены 24ч ===
    const priceFirst = candles24h[0].close;
    const priceLast = candles24h[candles24h.length - 1].close;
    const priceChange24h = ((priceLast - priceFirst) / priceFirst) * 100;

    // === Метрика 4: BB Squeeze ===
    let bbSqueezeStrength = 0;
    if (config.checkBBSqueeze) {
      const bbWidth = this.analyzer.getBollingerBandsWidth(closes, 20, 2);
      if (bbWidth && bbWidth.avgWidth > 0) {
        const ratio = bbWidth.width / bbWidth.avgWidth;
        // Чем меньше ratio, тем сильнее squeeze (< 0.8 = squeeze)
        if (ratio < 0.8) {
          bbSqueezeStrength = Math.max(0, 1 - ratio); // 0.8 → 0.2, 0.5 → 0.5, 0.3 → 0.7
        }
      }
    }

    // === Метрика 5: EMA Alignment ===
    let emaAlignment = false;
    if (config.checkMomentum) {
      const ema = this.analyzer.getEMA(closes);
      if (ema) {
        emaAlignment = ema.ema9 > ema.ema21 && ema.ema21 > ema.ema50;
      }
    }

    // === Метрика 6: RSI ===
    const rsi = this.analyzer.getRSI(closes, 14);

    // === Scoring ===
    let score = 0;
    const reasons: string[] = [];

    // Волатильность: > 5% (+3), > 10% (+5), > 15% (+7)
    if (volatility24h > 15) {
      score += 7;
      reasons.push(`High volatility ${volatility24h.toFixed(1)}%`);
    } else if (volatility24h > 10) {
      score += 5;
      reasons.push(`Good volatility ${volatility24h.toFixed(1)}%`);
    } else if (volatility24h > 5) {
      score += 3;
      reasons.push(`Volatility ${volatility24h.toFixed(1)}%`);
    }

    // Объём: > $5M (+3), > $10M (+5)
    if (volume24h > 10_000_000) {
      score += 5;
      reasons.push(`High volume $${(volume24h / 1e6).toFixed(1)}M`);
    } else if (volume24h > 5_000_000) {
      score += 3;
      reasons.push(`Good volume $${(volume24h / 1e6).toFixed(1)}M`);
    }

    // BB Squeeze: сильное сужение = подготовка к пробою
    if (bbSqueezeStrength > 0.5) {
      score += 6;
      reasons.push(`Strong BB squeeze (${(bbSqueezeStrength * 100).toFixed(0)}%)`);
    } else if (bbSqueezeStrength > 0.3) {
      score += 4;
      reasons.push(`BB squeeze detected`);
    }

    // EMA Alignment: тренд
    if (emaAlignment) {
      score += 3;
      reasons.push('Bullish EMA alignment');
    }

    // RSI в зоне интереса: < 40 (перепродан) или > 60 (перекуплен, но тренд)
    if (rsi != null) {
      if (rsi < 40) {
        score += 2;
        reasons.push(`RSI oversold (${rsi.toFixed(0)})`);
      } else if (rsi > 60 && emaAlignment) {
        score += 2;
        reasons.push(`RSI trending (${rsi.toFixed(0)})`);
      }
    }

    // Momentum: сильное изменение цены за 24ч
    if (Math.abs(priceChange24h) > 10) {
      score += 2;
      reasons.push(`Strong 24h move ${priceChange24h > 0 ? '+' : ''}${priceChange24h.toFixed(1)}%`);
    }

    if (score === 0) return null; // no signals

    return {
      symbol,
      score,
      rank: 0, // будет установлен в quickScan
      reasons,
      metrics: {
        volume24h,
        volatility24h,
        priceChange24h,
        bbSqueezeStrength,
        emaAlignment,
        rsi,
        currentPrice: priceLast
      }
    };
  }

  /**
   * Получить список популярных монет для сканирования
   * TODO: динамическая загрузка с биржи через API
   */
  static getDefaultSymbols(): string[] {
    return [
      'BTC/USDT:USDT',
      'ETH/USDT:USDT',
      'SOL/USDT:USDT',
      'BNB/USDT:USDT',
      'XRP/USDT:USDT',
      'ADA/USDT:USDT',
      'DOGE/USDT:USDT',
      'AVAX/USDT:USDT',
      'DOT/USDT:USDT',
      'MATIC/USDT:USDT',
      'LINK/USDT:USDT',
      'UNI/USDT:USDT',
      'ATOM/USDT:USDT',
      'LTC/USDT:USDT',
      'APT/USDT:USDT',
      'ARB/USDT:USDT',
      'OP/USDT:USDT',
      'SUI/USDT:USDT',
      'TIA/USDT:USDT',
      'SEI/USDT:USDT',
      'INJ/USDT:USDT',
      'FET/USDT:USDT',
      'NEAR/USDT:USDT',
      'RUNE/USDT:USDT',
      'FTM/USDT:USDT',
      'GALA/USDT:USDT',
      'SAND/USDT:USDT',
      'MANA/USDT:USDT',
      'AXS/USDT:USDT',
      'APE/USDT:USDT'
    ];
  }
}
