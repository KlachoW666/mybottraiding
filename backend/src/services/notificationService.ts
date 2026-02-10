/**
 * Notification Service — алерты при пробое/сигнале (Telegram, Discord)
 */

import { logger } from '../lib/logger';

export interface NotificationConfig {
  telegram?: { botToken: string; chatId: string };
  discord?: { webhookUrl: string };
}

export interface BreakoutAlertPayload {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  levelPrice?: number;
  entryZone?: { optimal: number; min: number; max: number };
}

export interface SignalAlertPayload {
  symbol: string;
  side: 'long' | 'short';
  confidence: number;
  reason?: string;
}

let config: NotificationConfig = {};

export function setNotificationConfig(cfg: NotificationConfig): void {
  config = { ...cfg };
}

export function getNotificationConfig(): NotificationConfig {
  return { ...config };
}

async function sendTelegram(text: string): Promise<boolean> {
  const tg = config.telegram;
  if (!tg?.botToken?.trim() || !tg?.chatId?.trim()) return false;
  try {
    const url = `https://api.telegram.org/bot${tg.botToken.trim()}/sendMessage`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: tg.chatId.trim(),
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    const data = (await resp.json().catch(() => ({}))) as { ok?: boolean };
    return !!data?.ok;
  } catch (e) {
    logger.warn('Notification', 'Telegram send failed', { error: e });
    return false;
  }
}

async function sendDiscord(text: string): Promise<boolean> {
  const dc = config.discord;
  if (!dc?.webhookUrl?.trim()) return false;
  try {
    const resp = await fetch(dc.webhookUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text })
    });
    return resp.ok;
  } catch (e) {
    logger.warn('Notification', 'Discord send failed', { error: e });
    return false;
  }
}

async function broadcast(text: string): Promise<void> {
  await Promise.all([sendTelegram(text), sendDiscord(text)]);
}

export async function notifyBreakoutAlert(payload: BreakoutAlertPayload): Promise<void> {
  const dir = payload.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT';
  const conf = (payload.confidence * 100).toFixed(0);
  let text = `Breakout: ${payload.symbol} ${dir} (confidence ${conf}%)`;
  if (payload.levelPrice != null) text += `\nLevel: ${payload.levelPrice}`;
  if (payload.entryZone?.optimal != null) text += `\nEntry zone: ${payload.entryZone.optimal}`;
  await broadcast(text);
}

export async function notifySignalAlert(payload: SignalAlertPayload): Promise<void> {
  const side = payload.side === 'long' ? '🟢 Long' : '🔴 Short';
  const conf = (payload.confidence * 100).toFixed(0);
  let text = `Signal: ${payload.symbol} ${side} (${conf}%)`;
  if (payload.reason) text += `\n${payload.reason}`;
  await broadcast(text);
}
