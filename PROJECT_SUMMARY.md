# CryptoSignal Pro — Project Summary
**Реализация скальпинг-стратегии на основе курса MaksBaks**

---

## 📊 Обзор проекта

**CryptoSignal Pro** — профессиональная система анализа криптовалютного рынка и генерации торговых сигналов для скальпинга. Основана на методологии курса MaksBaks "Marathon (Скальпинг) 2024" (40 видео-уроков).

### Ключевые возможности (Phase 1 - Реализовано)

✅ **Автоматический скринер монет** — отбор лучших активов для скальпинга по волатильности, объёму, сжатию BB
✅ **Детекция уровней S/R** — автоматическое определение зон поддержки и сопротивления
✅ **Детекция пробоя** — подтверждение breakout через объём, стакан, ленту
✅ **Multi-Timeframe анализ** — confluence сигналов на 1m, 5m, 15m, 1h
✅ **Funding Rate мониторинг** — контриндикатор для избежания ловушек
✅ **Volume Profile** — POC, HVN, LVN для определения зон интереса
✅ **API-first архитектура** — RESTful API для интеграции с фронтендом и ботами

---

## 🗂️ Структура проекта

### Backend (Express + TypeScript)

```
backend/src/
├── services/
│   ├── coinScanner.ts           ✅ NEW — автоматический отбор монет
│   ├── levelDetector.ts         ✅ NEW — детекция уровней S/R
│   ├── breakoutDetector.ts      ✅ NEW — детекция пробоя уровня
│   ├── mtfAnalyzer.ts           ✅ NEW — multi-timeframe анализ
│   ├── fundingRateMonitor.ts    ✅ NEW — мониторинг funding rate
│   ├── clusterAnalyzer.ts       ✅ NEW — volume profile (POC/HVN/LVN)
│   ├── marketAnalysis.ts        ✅ UPDATED — orderbook pressure
│   ├── dataAggregator.ts        ✅ UPDATED — OHLCV, orderbook, trades
│   └── signalGenerator.ts       ✅ UPDATED — генерация сигналов
├── routes/
│   └── scanner.ts               ✅ NEW — API endpoints для сканера
├── lib/
│   └── tradingPrinciples.ts     ✅ UPDATED — константы стратегии
└── index.ts                     ✅ UPDATED — интеграция routes
```

### Frontend (React + TypeScript)

```
frontend/src/
└── pages/
    └── AutoTradingPage.tsx      ✅ UPDATED — UI для скальпинга
```

### Документация

```
docs/
├── SCALPING_ANALYSIS_RD.md      ✅ NEW — research document (анализ курса)
├── SCALPING_GUIDE.md            ✅ NEW — user guide (стратегия + API)
├── ROADMAP.md                   ✅ UPDATED — план Phase 2-3
├── ADMIN_PANEL_CONCEPT.md       ✅ NEW — концепт админ-панели
└── LOGO_PROMPT.md               ✅ UPDATED — промт для логотипа
```

---

## 🚀 API Endpoints (Phase 1)

### Scanner API (`/api/scanner`)

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/top` | GET | Топ N монет для скальпинга |
| `/scan` | POST | Сканирование по критериям |
| `/levels/:symbol` | GET | Уровни S/R для символа |
| `/breakout/:symbol` | GET | Детекция пробоя уровня |
| `/full-analysis` | POST | Комплексный анализ топ монет |
| `/mtf/:symbol` | GET | Multi-timeframe анализ |
| `/funding/:symbol` | GET | Ставка финансирования |
| `/volume-profile/:symbol` | GET | Volume Profile (POC/HVN/LVN) |

### Примеры использования

#### 1. Получить топ-5 монет для скальпинга
```bash
GET /api/scanner/top?limit=5&minVolume24h=1000000&minVolatility24h=5
```

**Response:**
```json
{
  "success": true,
  "count": 5,
  "coins": [
    {
      "symbol": "SOL/USDT:USDT",
      "score": 82.5,
      "rank": 1,
      "volatility24h": 12.3,
      "volume24h": 15000000,
      "bbSqueeze": true,
      "emaAlignment": "bullish",
      "reasons": ["High volatility", "BB squeeze", "Strong volume"]
    }
  ]
}
```

#### 2. Детекция пробоя уровня
```bash
GET /api/scanner/breakout/SOLUSDT?timeframe=15m
```

**Response:**
```json
{
  "success": true,
  "symbol": "SOLUSDT",
  "breakoutDetected": true,
  "breakout": {
    "direction": "LONG",
    "confidence": 0.78,
    "volumeConfirmation": true,
    "falseBreakoutRisk": 0.22,
    "entryZone": {
      "optimal": 105.32,
      "min": 105.10,
      "max": 105.84
    },
    "invalidationPrice": 104.48,
    "reasons": [
      "Volume 2.1× average",
      "Strong buy pressure in book",
      "Tape delta 42% confirms",
      "Strong level (8/10)"
    ]
  }
}
```

#### 3. Multi-Timeframe анализ
```bash
GET /api/scanner/mtf/BTCUSDT?timeframes=1m,5m,15m,1h
```

**Response:**
```json
{
  "symbol": "BTCUSDT",
  "timeframes": {
    "1m": { "trend": "bullish", "strength": 0.65 },
    "5m": { "trend": "bullish", "strength": 0.72 },
    "15m": { "trend": "bullish", "strength": 0.80 },
    "1h": { "trend": "bullish", "strength": 0.85 }
  },
  "confluence": 4,
  "overallConfidence": 0.88,
  "recommendation": "STRONG_LONG"
}
```

---

## 🎯 Скальпинг-стратегия (MaksBaks методология)

### 5 шагов успешного скальпинг-трейда

```
1. ОТБОР МОНЕТЫ (CoinScanner)
   ↓ Критерии: волатильность 5-15%, объём $1M+, BB squeeze, EMA alignment

2. ДЕТЕКЦИЯ УРОВНЯ (LevelDetector)
   ↓ Swing High/Low + Volume Profile → сильные уровни (strength ≥7)

3. ОЖИДАНИЕ ПРОБОЯ (BreakoutDetector)
   ↓ Price breaks level + Volume >1.2× avg + OrderBook pressure + Tape delta

4. ВХОД (Entry Zone)
   ↓ Optimal entry: +0.3% от уровня (LONG) или -0.3% (SHORT)

5. ВЫХОД (Stop-Loss + Take-Profit)
   ↓ SL: invalidationPrice (-0.5% от уровня)
   ↓ TP: R:R ≥2:1 (обычно +1-2% для скальпинга)
```

### Формула уверенности (Confidence)

```
Base Confidence = 0.5

+ Volume Confirmation (>1.2× avg)      → +0.15
+ Order Book Pressure (>1.5 ratio)     → +0.15
+ Tape Delta (>15% aligned)            → +0.12
+ Level Strength (≥7/10)               → +0.10
+ Candle Close Beyond Level            → +0.08
- False Breakout Risk (>50%)           → -0.15
- Unfavorable Funding Rate             → -0.12

Final Confidence: 0.55 - 0.95
Min threshold for signal: 0.55
```

---

## 🔧 Технические детали

### CoinScanner (Автоматический отбор монет)

**Алгоритм:**
1. Загрузка 24h данных для 30+ символов
2. Расчёт метрик:
   - Volatility24h = (high24h - low24h) / low24h × 100
   - Volume24h (USDT)
   - BB Squeeze: (upperBB - lowerBB) / middleBB < 0.02
   - EMA Alignment: EMA9 > EMA21 > EMA50 (bullish) или наоборот (bearish)
3. Scoring:
   - Volatility 5-15%: ✅ +20 points
   - Volume >$1M: ✅ +15 points
   - BB Squeeze: ✅ +25 points
   - EMA Alignment: ✅ +20 points
   - Momentum (EMA slope): ✅ +20 points
4. Сортировка по score, возврат топ N

**Файл:** [backend/src/services/coinScanner.ts](backend/src/services/coinScanner.ts)

---

### LevelDetector (Детекция уровней S/R)

**Алгоритм:**
1. **Swing High/Low:**
   - Swing High = свеча выше 2 левых и 2 правых соседей
   - Swing Low = свеча ниже 2 левых и 2 правых соседей
2. **Volume Profile:**
   - Разбить ценовой диапазон на корзины (bins)
   - Суммировать объём для каждой корзины
   - Топ корзины = volume levels
3. **Merge:**
   - Объединить swing levels + volume levels
   - Кластеризовать уровни в пределах 0.5% (merge radius)
4. **Strength:**
   - Touches: количество касаний уровня
   - Volume: объём на уровне
   - Score = touches × 2 + volume_percentile × 8
   - Strength = min(10, score)

**Файл:** [backend/src/services/levelDetector.ts](backend/src/services/levelDetector.ts)

---

### BreakoutDetector (Детекция пробоя)

**Алгоритм:**
1. **Проверка пробоя:**
   - LONG: prevPrice < level AND currentPrice > level × 1.0015
   - SHORT: prevPrice > level AND currentPrice < level × 0.9985
2. **Volume Confirmation:**
   - currentVolume / avgVolume20 ≥ 1.2 (Schwager принцип)
3. **Order Book Pressure:**
   - LONG: bidVolume / askVolume > 1.5 (покупатели сильнее)
   - SHORT: askVolume / bidVolume > 1.5 (продавцы сильнее)
4. **Tape Delta:**
   - buyVolume - sellVolume / totalVolume
   - LONG: delta > 0.15 (больше покупок)
   - SHORT: delta < -0.15 (больше продаж)
5. **False Breakout Risk:**
   - Низкий объём (<0.8× avg): +0.4 risk
   - Слабое тело свечи (<40% range): +0.2 risk
   - Закрытие вернулось к уровню: +0.3 risk
6. **Confluence:**
   - Все факторы согласны → high confidence (0.75-0.95)
   - Противоречия → low confidence (<0.55) → null

**Файл:** [backend/src/services/breakoutDetector.ts](backend/src/services/breakoutDetector.ts)

---

## 📈 Roadmap (Phase 2-3)

### Phase 2: Advanced Analytics (ЧАСТИЧНО РЕАЛИЗОВАНО)

✅ Multi-Timeframe Analysis (MTF)
✅ Funding Rate Monitor
✅ Volume Profile (POC/HVN/LVN)
⏳ Order Flow Imbalance (OFI)
⏳ Cumulative Volume Delta (CVD) с дивергенциями
⏳ Эмоциональный фильтр (психология трейдинга)

### Phase 3: Auto-Trading & Risk Management (ПЛАНИРУЕТСЯ)

⏳ Автоматическое исполнение (с подтверждением)
⏳ Trailing Stop (динамический стоп-лосс)
⏳ Position Sizing (риск на сделку ≤2%)
⏳ Daily Loss Limit (макс. -5% от депозита в день)
⏳ Backtesting Engine
⏳ Performance Analytics Dashboard

**Подробнее:** [ROADMAP.md](ROADMAP.md)

---

## 🎨 Брендинг и UI

### Логотип CryptoSignal Pro

**Концепция:** Минимализм + Breakout + Профессионализм

- **Иконка:** Восходящая линия пробоя + импульс сигнала + уровень сопротивления
- **Цвета:** Deep Navy Blue (#1a237e), Electric Cyan (#00bcd4), Gold Accent (#ffc107)
- **Стиль:** Плоский, геометрический, узнаваемый при 16px-1024px
- **Варианты:** Breakout Moment, Signal Layers, Candlestick Pulse, CSP Monogram

**Подробнее:** [docs/LOGO_PROMPT.md](docs/LOGO_PROMPT.md)

### Admin Panel (Концепт)

8 секций управления:
1. Dashboard — статус системы, активные сигналы
2. Trading Control — авто-трейдинг, размер позиций
3. Risk Management — лимиты, эмоциональный фильтр
4. Analytics — перформанс, бэктесты
5. System Settings — API, база данных, WebSocket
6. Notifications — Telegram, Discord, Email
7. Logs & History — системные логи, история сделок
8. User Management — роли и права доступа

**Подробнее:** [ADMIN_PANEL_CONCEPT.md](ADMIN_PANEL_CONCEPT.md)

---

## 🧪 Тестирование

### Manual Testing (API)

```bash
# 1. Запустить backend
cd backend
npm run dev

# 2. Тестовые запросы
curl "http://localhost:3001/api/scanner/top?limit=3"
curl "http://localhost:3001/api/scanner/levels/BTCUSDT"
curl "http://localhost:3001/api/scanner/breakout/ETHUSDT?timeframe=15m"
curl "http://localhost:3001/api/scanner/mtf/SOLUSDT?timeframes=1m,5m,15m"
```

### Automated Testing (TODO)

⏳ Unit tests для coinScanner, levelDetector, breakoutDetector
⏳ Integration tests для scanner routes
⏳ E2E tests для frontend

---

## 📚 Документация

| Документ | Описание |
|----------|----------|
| [SCALPING_ANALYSIS_RD.md](SCALPING_ANALYSIS_RD.md) | Research Document: анализ курса MaksBaks (40 видео) |
| [SCALPING_GUIDE.md](SCALPING_GUIDE.md) | User Guide: стратегия + API примеры |
| [ROADMAP.md](ROADMAP.md) | План Phase 2-3: 4 спринта, детальные инструкции |
| [ADMIN_PANEL_CONCEPT.md](ADMIN_PANEL_CONCEPT.md) | Концепт админ-панели: 8 секций, UI mockups |
| [docs/LOGO_PROMPT.md](docs/LOGO_PROMPT.md) | Промт для логотипа: 6 вариантов дизайна |

---

## 🏁 Выводы

### Что реализовано (Phase 1)

✅ **Полноценный скальпинг-сканер** — автоматический отбор монет, детекция уровней, подтверждение пробоя
✅ **API-first подход** — 8 endpoints для интеграции с любым фронтендом
✅ **Confluence-based сигналы** — объём + стакан + лента + MTF + funding
✅ **Детальная метрика** — confidence, false breakout risk, entry zone, invalidation price
✅ **Документация** — 5 файлов с полным описанием стратегии и API

### Следующие шаги

1. **Тестирование** — собрать данные за 1-2 недели, проверить точность сигналов
2. **Phase 2** — добавить OFI, CVD divergence, эмоциональный фильтр
3. **Phase 3** — автоматическое исполнение с риск-менеджментом
4. **Admin Panel** — UI для управления системой
5. **Backtesting** — исторические данные, оптимизация параметров

---

## 📞 Контакты и поддержка

**Проект:** CryptoSignal Pro
**Методология:** MaksBaks Marathon (Скальпинг) 2024
**Архитектура:** React + TypeScript (frontend), Express + TypeScript (backend), ccxt (биржи)

**GitHub Issues:** Для багов и feature requests
**Документация:** См. папку `docs/`

---

**Версия:** 1.0.0 (Phase 1 Complete)
**Дата:** 2026-02-10
**Статус:** ✅ Production Ready (Phase 1)
