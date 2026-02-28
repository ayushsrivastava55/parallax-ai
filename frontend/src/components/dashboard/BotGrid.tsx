import { useBots } from '../../hooks/useBots.ts';
import { BotCard } from '../bots/BotCard.tsx';
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

export function BotGrid() {
  const { data, loading } = useBots();

  if (loading && !data) {
    return <div style={wrap}><div style={header}>Registered Bots</div><EmptyState title="Loading..." /></div>;
  }

  return (
    <div style={wrap}>
      <div style={header}>Registered Bots</div>
      {!data?.length ? (
        <EmptyState
          title="No bots registered"
          subtitle="Bots appear here after they make authenticated requests to the gateway"
        />
      ) : (
        <div style={grid}>
          {data.map((bot) => (
            <BotCard key={bot.agentId} bot={bot} />
          ))}
        </div>
      )}
    </div>
  );
}
