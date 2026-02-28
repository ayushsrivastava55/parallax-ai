import { useCallback } from 'react';
import { usePolling } from './usePolling.ts';
import { listAgents } from '../lib/api.ts';
import type { AgentRecord } from '../lib/constants.ts';

export function useAgents() {
  const fetcher = useCallback(() => listAgents().then((d) => d.bots), []);
  return usePolling<AgentRecord[]>(fetcher, 15_000);
}
