import { useCallback } from 'react';
import { usePolling } from './usePolling.ts';
import { getAgentActivity } from '../lib/api.ts';
import type { ActivityEvent } from '../lib/constants.ts';

export function useAgentActivity(agentId: string, limit = 50) {
  const fetcher = useCallback(
    () => getAgentActivity(agentId, limit).then((d) => d.activity),
    [agentId, limit],
  );
  return usePolling<ActivityEvent[]>(fetcher, 10_000);
}
