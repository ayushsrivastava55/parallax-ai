import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '@elizaos/core';
import type { BotRecord, BotStatus, PlatformStats } from '../types.ts';

const REGISTRY_DIR = '.flash';
const REGISTRY_FILE = join(REGISTRY_DIR, 'bot-registry.jsonl');

const bots = new Map<string, BotRecord>();
let loaded = false;

function ensureDir(): void {
  if (!existsSync(REGISTRY_DIR)) mkdirSync(REGISTRY_DIR, { recursive: true });
}

function load(): void {
  if (loaded) return;
  loaded = true;
  ensureDir();
  if (!existsSync(REGISTRY_FILE)) return;
  try {
    const lines = readFileSync(REGISTRY_FILE, 'utf-8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const record = JSON.parse(line) as BotRecord;
        if (record.agentId) bots.set(record.agentId, record);
      } catch { /* skip corrupt lines */ }
    }
    logger.info({ count: bots.size }, '[BOT_REGISTRY] loaded');
  } catch (err) {
    logger.warn({ err }, '[BOT_REGISTRY] failed to load');
  }
}

function persist(record: BotRecord): void {
  ensureDir();
  appendFileSync(REGISTRY_FILE, JSON.stringify(record) + '\n');
}

function computeStatus(lastSeenAt: string): BotStatus {
  const ago = Date.now() - new Date(lastSeenAt).getTime();
  if (ago < 30 * 60_000) return 'active';
  if (ago < 2 * 60 * 60_000) return 'idle';
  return 'stale';
}

export function ensureBotRegistered(agentId: string, keyId: string): void {
  load();
  const now = new Date().toISOString();
  const existing = bots.get(agentId);
  if (existing) {
    existing.lastSeenAt = now;
    existing.totalRequests += 1;
    existing.status = computeStatus(now);
    persist(existing);
    return;
  }
  const record: BotRecord = {
    agentId,
    keyId,
    registeredAt: now,
    lastSeenAt: now,
    lastHeartbeatAt: null,
    totalRequests: 1,
    totalTrades: 0,
    totalVolume: 0,
    activeStrategies: [],
    status: 'active',
  };
  bots.set(agentId, record);
  persist(record);
  logger.info({ agentId }, '[BOT_REGISTRY] new bot registered');
}

export function recordBotTrade(agentId: string, volumeUsd: number): void {
  load();
  const bot = bots.get(agentId);
  if (!bot) return;
  bot.totalTrades += 1;
  bot.totalVolume += volumeUsd;
  persist(bot);
}

export function recordBotHeartbeat(
  agentId: string,
  strategies?: string[],
): void {
  load();
  const bot = bots.get(agentId);
  if (!bot) return;
  const now = new Date().toISOString();
  bot.lastHeartbeatAt = now;
  bot.lastSeenAt = now;
  bot.status = 'active';
  if (strategies?.length) bot.activeStrategies = strategies;
  persist(bot);
}

export function getBot(agentId: string): BotRecord | undefined {
  load();
  const bot = bots.get(agentId);
  if (bot) bot.status = computeStatus(bot.lastSeenAt);
  return bot;
}

export function getAllBots(): BotRecord[] {
  load();
  return Array.from(bots.values()).map((b) => ({
    ...b,
    status: computeStatus(b.lastSeenAt),
  }));
}

export function getPlatformStats(connectorHealth: Record<string, boolean> = {}): PlatformStats {
  load();
  const allBots = getAllBots();
  const strategies = new Set<string>();
  let totalVolume = 0;
  let totalTrades = 0;
  let activeBots = 0;

  for (const bot of allBots) {
    totalVolume += bot.totalVolume;
    totalTrades += bot.totalTrades;
    if (bot.status === 'active') activeBots++;
    for (const s of bot.activeStrategies) strategies.add(s);
  }

  return {
    totalBots: allBots.length,
    activeBots,
    totalVolume,
    totalTrades,
    activeStrategies: strategies.size,
    connectorHealth,
  };
}
