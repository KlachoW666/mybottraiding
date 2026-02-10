/**
 * Кластерный анализ — Volume Profile, POC, HVN, LVN (MaksBaks Урок 8)
 */

export interface PriceCluster {
  price: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;
  type: 'POC' | 'HVN' | 'LVN' | 'neutral';
}

export interface VolumeProfile {
  clusters: PriceCluster[];
  poc: number;
  hvnZones: [number, number][];
  lvnZones: [number, number][];
}
