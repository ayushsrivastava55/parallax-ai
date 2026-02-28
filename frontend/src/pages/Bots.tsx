import { useBots } from '../hooks/useBots.ts';
import { BotCard } from '../components/bots/BotCard.tsx';
import { EmptyState } from '../components/shared/EmptyState.tsx';
import type { CSSProperties } from 'react';

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: 16,
};

export default function Bots() {
  const { data, loading } = useBots();

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, color: 'var(--t1)', marginBottom: 24 }}>
        Bots
      </h1>
      {loading && !data ? (
        <EmptyState title="Loading..." />
      ) : !data?.length ? (
        <EmptyState title="No bots registered" subtitle="Bots appear after making authenticated gateway requests" />
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
