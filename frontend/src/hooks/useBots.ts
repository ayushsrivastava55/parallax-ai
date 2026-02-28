import { useCallback } from 'react';
import { usePolling } from './usePolling.ts';
import { listBots } from '../lib/api.ts';
import type { BotRecord } from '../lib/constants.ts';

export function useBots() {
  const fetcher = useCallback(() => listBots().then((d) => d.bots), []);
  return usePolling<BotRecord[]>(fetcher, 15_000);
}
