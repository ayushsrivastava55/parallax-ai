import { useCallback } from 'react';
import { usePolling } from './usePolling.ts';
import { getBot, getBotStats } from '../lib/api.ts';
import type { BotRecord, BotStats } from '../lib/constants.ts';

export function useBotDetail(agentId: string) {
  const botFetcher = useCallback(() => getBot(agentId), [agentId]);
  const statsFetcher = useCallback(() => getBotStats(agentId), [agentId]);
  const bot = usePolling<BotRecord>(botFetcher, 15_000);
  const stats = usePolling<BotStats>(statsFetcher, 15_000);
  return { bot, stats };
}
