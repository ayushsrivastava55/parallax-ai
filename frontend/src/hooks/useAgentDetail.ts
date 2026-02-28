import { useCallback } from 'react';
import { usePolling } from './usePolling.ts';
import { getAgent, getAgentStats } from '../lib/api.ts';
import type { AgentRecord, AgentStats } from '../lib/constants.ts';

export function useAgentDetail(agentId: string) {
  const agentFetcher = useCallback(() => getAgent(agentId), [agentId]);
  const statsFetcher = useCallback(() => getAgentStats(agentId), [agentId]);
  const agent = usePolling<AgentRecord>(agentFetcher, 15_000);
  const stats = usePolling<AgentStats>(statsFetcher, 15_000);
  return { agent, stats };
}
