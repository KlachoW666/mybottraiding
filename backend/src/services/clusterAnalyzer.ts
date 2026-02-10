/**
 * Cluster Analyzer — Footprint, POC, HVN, LVN (MaksBaks Урок 8)
 */

import { TradeInput } from './marketAnalysis';
import { VolumeProfile, PriceCluster } from '../types/cluster';

export function buildVolumeProfile(
  trades: TradeInput[],
  priceStep: number,
  midPrice: number
): VolumeProfile {
  const buckets = new Map<number, { buy: number; sell: number }>();
  for (const t of trades) {
    const bucket = Math.round(t.price / priceStep) * priceStep;
    const cur = buckets.get(bucket) || { buy: 0, sell: 0 };
    const vol = t.quoteQuantity ?? t.price * t.amount;
    if (t.isBuy) cur.buy += vol;
    else cur.sell += vol;
    buckets.set(bucket, cur);
  }

  let maxVol = 0;
  let poc = midPrice;
  const clusters: PriceCluster[] = [];
  for (const [price, { buy, sell }] of buckets) {
    const total = buy + sell;
    if (total > maxVol) {
      maxVol = total;
      poc = price;
    }
    clusters.push({
      price,
      buyVolume: buy,
      sellVolume: sell,
      delta: buy - sell,
      type: 'neutral'
    });
  }

  clusters.sort((a, b) => a.price - b.price);
  const avgVol = clusters.length > 0
    ? clusters.reduce((s, c) => s + c.buyVolume + c.sellVolume, 0) / clusters.length
    : 0;

  for (const c of clusters) {
    const vol = c.buyVolume + c.sellVolume;
    if (c.price === poc) c.type = 'POC';
    else if (vol > avgVol * 1.5) c.type = 'HVN';
    else if (vol < avgVol * 0.5) c.type = 'LVN';
  }

  const hvnZones: [number, number][] = [];
  const lvnZones: [number, number][] = [];
  let i = 0;
  while (i < clusters.length) {
    if (clusters[i].type === 'HVN') {
      const start = clusters[i].price;
      while (i < clusters.length && clusters[i].type === 'HVN') i++;
      hvnZones.push([start, clusters[i - 1].price]);
    } else if (clusters[i].type === 'LVN') {
      const start = clusters[i].price;
      while (i < clusters.length && clusters[i].type === 'LVN') i++;
      lvnZones.push([start, clusters[i - 1].price]);
    } else {
      i++;
    }
  }

  return { clusters, poc, hvnZones, lvnZones };
}
