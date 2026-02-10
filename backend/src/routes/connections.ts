import { Router } from 'express';
import ccxt from 'ccxt';
import { config } from '../config';

const router = Router();

function okxOpts(proxyOverride?: string | null, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const proxyUrl = (proxyOverride && proxyOverride.trim()) || config.proxy;
  const opts: Record<string, unknown> = {
    enableRateLimit: true,
    options: { defaultType: 'swap' },
    timeout: 30000, // OKX иногда медленно отвечает, особенно /asset/currencies
    ...extra
  };
  if (proxyUrl) {
    opts.httpsProxy = proxyUrl;
  }
  return opts;
}

router.post('/check', async (req, res) => {
  try {
    const { exchange, apiKey, apiSecret } = req.body as { exchange: string; apiKey?: string; apiSecret?: string };
    if (!exchange) {
      res.status(400).json({ ok: false, message: 'exchange required' });
      return;
    }
    const exId = String(exchange).toLowerCase();

    if (exId === 'bingx') {
      const key = (apiKey || '').trim();
      const secret = (apiSecret || '').trim();
      if (!key || !secret) {
        res.status(400).json({ ok: false, message: 'API Key и API Secret обязательны для BingX' });
        return;
      }
      const ex = new ccxt.bingx({
        apiKey: key,
        secret,
        enableRateLimit: true,
        options: { defaultType: 'swap' }
      });
      await ex.fetchBalance();
      res.json({ ok: true, message: 'Подключение успешно' });
      return;
    }

    if (exId === 'okx') {
      const key = (apiKey || process.env.OKX_API_KEY || '').trim();
      const secret = (apiSecret || process.env.OKX_SECRET || '').trim();
      const passphrase = (req.body?.passphrase as string) || process.env.OKX_PASSPHRASE || '';
      const proxy = (req.body?.proxy as string)?.trim() || null; // http://user:pass@ip:port
      if (!key || !secret) {
        res.status(400).json({ ok: false, message: 'API Key и Secret обязательны для OKX' });
        return;
      }
      const ex = new ccxt.okx(okxOpts(proxy, {
        apiKey: key,
        secret,
        password: passphrase
      }));
      await ex.fetchBalance();
      res.json({ ok: true, message: 'OKX: подключение успешно' });
      return;
    }

    res.status(400).json({ ok: false, message: `Поддерживается только OKX` });
  } catch (e: any) {
    const msg = e?.message || String(e);
    res.status(200).json({ ok: false, message: msg });
  }
});

router.get('/test-public', async (req, res) => {
  try {
    const proxy = (req.query?.proxy as string)?.trim() || null;
    const ex = new ccxt.okx(okxOpts(proxy));
    await ex.fetchTicker('BTC/USDT:USDT');
    res.json({ ok: true, message: 'OKX публичный API доступен' });
  } catch (e: any) {
    res.status(200).json({ ok: false, message: (e?.message || String(e)) });
  }
});

export default router;
