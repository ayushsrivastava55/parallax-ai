import { usePlatformStats } from '../../hooks/usePlatformStats.ts';
import { StatCard } from '../shared/StatCard.tsx';
import { formatUsd } from '../../lib/formatters.ts';
import type { CSSProperties } from 'react';

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 16,
  marginBottom: 24,
};

export function HeroStats() {
  const { data } = usePlatformStats();

  const healthOk = data
    ? Object.values(data.connectorHealth).some(Boolean)
    : false;

  return (
    <div style={grid}>
      <StatCard label="Bots" value={data ? String(data.totalBots) : '-'} accent="var(--gold)" />
      <StatCard label="Volume" value={data ? formatUsd(data.totalVolume) : '-'} />
      <StatCard label="Strategies" value={data ? String(data.activeStrategies) : '-'} />
      <StatCard
        label="Health"
        value={data ? (healthOk ? 'OK' : 'DOWN') : '-'}
        accent={healthOk ? 'var(--green)' : 'var(--red)'}
      />
    </div>
  );
}
