import { useAgents } from '../hooks/useAgents.ts';
import { AgentCard } from '../components/agents/AgentCard.tsx';
import { EmptyState } from '../components/shared/EmptyState.tsx';
import type { CSSProperties } from 'react';

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: 16,
};

export default function Agents() {
  const { data, loading } = useAgents();

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, color: 'var(--t1)', marginBottom: 24 }}>
        Agents
      </h1>
      {loading && !data ? (
        <EmptyState title="Loading..." />
      ) : !data?.length ? (
        <EmptyState title="No agents registered" subtitle="Agents appear after making authenticated gateway requests" />
      ) : (
        <div style={grid}>
          {data.map((agent) => (
            <AgentCard key={agent.agentId} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
