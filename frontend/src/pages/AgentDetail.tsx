import { useParams, Link } from 'react-router-dom';
import { useAgentDetail } from '../hooks/useAgentDetail.ts';
import { useAgentActivity } from '../hooks/useAgentActivity.ts';
import { AgentProfile } from '../components/agents/AgentProfile.tsx';
import { AgentTradeHistory } from '../components/agents/AgentTradeHistory.tsx';
import { EmptyState } from '../components/shared/EmptyState.tsx';
import { Timestamp } from '../components/shared/Timestamp.tsx';
import { shortId } from '../lib/formatters.ts';
import type { CSSProperties } from 'react';

const row: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '100px 1fr auto',
  gap: 12,
  padding: '10px 20px',
  borderBottom: '1px solid var(--line)',
  fontFamily: 'var(--mono)',
  fontSize: 12,
  alignItems: 'center',
};

export default function AgentDetail() {
  const { agentId } = useParams<{ agentId: string }>();
  const { agent, stats } = useAgentDetail(agentId!);
  const activity = useAgentActivity(agentId!, 100);

  if (agent.loading && !agent.data) {
    return <EmptyState title="Loading..." />;
  }

  if (!agent.data) {
    return <EmptyState title="Agent not found" subtitle={`No agent with ID ${agentId}`} />;
  }

  return (
    <div>
      <Link
        to="/agents"
        style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--t3)', textDecoration: 'none', marginBottom: 16, display: 'inline-block' }}
      >
        &larr; All Agents
      </Link>
      <AgentProfile agent={agent.data} stats={stats.data} />
      <AgentTradeHistory activity={activity.data ?? []} />

      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)', fontFamily: 'var(--mono)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--t2)' }}>
          All Activity
        </div>
        {!activity.data?.length ? (
          <EmptyState title="No activity" />
        ) : (
          activity.data.map((e) => (
            <div key={e.id} style={row}>
              <Timestamp iso={e.timestamp} />
              <span style={{ color: 'var(--t1)' }}>{e.type}</span>
              <span style={{ color: 'var(--t3)', fontSize: 11 }}>{shortId(e.id)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
