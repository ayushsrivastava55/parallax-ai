import { useCallback } from 'react';
import { usePolling } from './usePolling.ts';
import { getBotActivity } from '../lib/api.ts';
import type { ActivityEvent } from '../lib/constants.ts';

export function useBotActivity(agentId: string, limit = 50) {
  const fetcher = useCallback(
    () => getBotActivity(agentId, limit).then((d) => d.activity),
    [agentId, limit],
  );
  return usePolling<ActivityEvent[]>(fetcher, 10_000);
}
