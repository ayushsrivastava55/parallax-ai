import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../../lib/types.js';
import type { ActivityEvent, BotStats } from '../types.ts';

const LOG_DIR = '.flash';
const LOG_FILE = join(LOG_DIR, 'activity-log.jsonl');
const RING_SIZE = 1000;

const ring: ActivityEvent[] = [];
let loaded = false;

function ensureDir(): void {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
}

function load(): void {
  if (loaded) return;
  loaded = true;
  ensureDir();
  if (!existsSync(LOG_FILE)) return;
  try {
    const lines = readFileSync(LOG_FILE, 'utf-8').split('\n').filter(Boolean);
    const recent = lines.slice(-RING_SIZE);
    for (const line of recent) {
      try {
        ring.push(JSON.parse(line) as ActivityEvent);
      } catch { /* skip */ }
    }
    logger.info({ count: ring.length }, '[ACTIVITY_TRACKER] loaded');
  } catch (err) {
    logger.warn({ err }, '[ACTIVITY_TRACKER] failed to load');
  }
}

export function recordActivity(event: ActivityEvent): void {
  load();
  ensureDir();
  ring.push(event);
  if (ring.length > RING_SIZE) ring.shift();
  appendFileSync(LOG_FILE, JSON.stringify(event) + '\n');
}

export function getActivityFeed(limit = 50): ActivityEvent[] {
  load();
  return ring.slice(-limit).reverse();
}

export function getBotActivity(agentId: string, limit = 50): ActivityEvent[] {
  load();
  return ring
    .filter((e) => e.agentId === agentId)
    .slice(-limit)
    .reverse();
}

export function getBotStats(agentId: string): BotStats {
  load();
  const events = ring.filter((e) => e.agentId === agentId);
  const trades = events.filter((e) => e.type === 'trades.execute');
  const successful = trades.filter((e) => {
    const status = (e.details as any)?.status;
    return status === 'filled' || status === 'partial' || status === 'submitted';
  });
  const strategies = new Set<string>();
  let totalVolume = 0;
  let totalPnl = 0;
  let heartbeats = 0;

  for (const e of events) {
    if (e.type === 'heartbeat') heartbeats++;
    const vol = (e.details as any)?.volumeUsd ?? (e.details as any)?.quotedCost ?? 0;
    if (typeof vol === 'number') totalVolume += vol;
    const pnl = (e.details as any)?.pnl ?? 0;
    if (typeof pnl === 'number') totalPnl += pnl;
    const strat = (e.details as any)?.strategy;
    if (typeof strat === 'string') strategies.add(strat);
  }

  const timestamps = events.map((e) => e.timestamp).sort();
  return {
    agentId,
    totalTrades: trades.length,
    successfulTrades: successful.length,
    totalVolume,
    totalPnl,
    winRate: trades.length > 0 ? successful.length / trades.length : 0,
    strategiesRun: Array.from(strategies),
    firstSeen: timestamps[0] ?? '',
    lastSeen: timestamps[timestamps.length - 1] ?? '',
    heartbeatsReceived: heartbeats,
  };
}

export function getRecentActivity(limit = 20): ActivityEvent[] {
  return getActivityFeed(limit);
}
