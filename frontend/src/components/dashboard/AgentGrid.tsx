import { useAgents } from '../../hooks/useAgents.ts';
import { AgentCard } from '../agents/AgentCard.tsx';
import { EmptyState } from '../shared/EmptyState.tsx';
import type { CSSProperties } from 'react';

const wrap: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 8,
  overflow: 'hidden',
};

const header: CSSProperties = {
  padding: '14px 20px',
  borderBottom: '1px solid var(--line)',
  fontFamily: 'var(--mono)',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--t2)',
};

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 16,
  padding: 16,
};

export function AgentGrid() {
  const { data, loading } = useAgents();

  if (loading && !data) {
    return <div style={wrap}><div style={header}>Registered Agents</div><EmptyState title="Loading..." /></div>;
  }

  return (
    <div style={wrap}>
      <div style={header}>Registered Agents</div>
      {!data?.length ? (
        <EmptyState
          title="No agents registered"
          subtitle="Agents appear here after they make authenticated requests to the gateway"
        />
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
