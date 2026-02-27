import type { Position, Platform } from '../types/index.js';

interface StoredPosition extends Position {
  orderId: string;
  timestamp: string;
}

const positions = new Map<string, StoredPosition>();

export function addPosition(params: {
  orderId: string;
  marketId: string;
  platform: Platform;
  marketTitle: string;
  outcomeLabel: string;
  size: number;
  entryPrice: number;
  timestamp: string;
}): void {
  positions.set(params.orderId, {
    orderId: params.orderId,
    marketId: params.marketId,
    platform: params.platform,
    marketTitle: params.marketTitle,
    outcomeLabel: params.outcomeLabel,
    size: params.size,
    avgEntryPrice: params.entryPrice,
    currentPrice: params.entryPrice,
    pnl: 0,
    pnlPercent: 0,
    resolutionDate: '',
    timestamp: params.timestamp,
  });
}

export function getAllPositions(): Position[] {
  return Array.from(positions.values());
}

export function updatePrice(orderId: string, currentPrice: number): void {
  const pos = positions.get(orderId);
  if (!pos) return;
  pos.currentPrice = currentPrice;
  pos.pnl = (currentPrice - pos.avgEntryPrice) * pos.size;
  pos.pnlPercent = pos.avgEntryPrice > 0
    ? ((currentPrice - pos.avgEntryPrice) / pos.avgEntryPrice) * 100
    : 0;
}

export function getPositionCount(): number {
  return positions.size;
}
