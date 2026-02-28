import { useHealth } from '../hooks/useHealth.ts';
import { ConnectorCard } from '../components/health/ConnectorCard.tsx';
import { StatCard } from '../components/shared/StatCard.tsx';
import type { CSSProperties } from 'react';

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 16,
  marginBottom: 24,
};

export default function Health() {
  const { health, connectors } = useHealth();

  const status = health.data?.status ?? 'unknown';
  const version = health.data?.version ?? '-';

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, color: 'var(--t1)', marginBottom: 24 }}>
        Platform Health
      </h1>

      <div style={grid}>
        <StatCard
          label="Gateway"
          value={status.toUpperCase()}
          accent={status === 'ok' ? 'var(--green)' : 'var(--red)'}
        />
        <StatCard label="Version" value={version} />
      </div>

      <h2 style={{ fontFamily: 'var(--mono)', fontSize: 13, textTransform: 'uppercase', color: 'var(--t2)', marginBottom: 16 }}>
        Connectors
      </h2>
      <div style={grid}>
        {connectors.data ? (
          Object.entries(connectors.data).map(([name, info]) => (
            <ConnectorCard
              key={name}
              name={name}
              ok={(info as any).ok}
              error={(info as any).error}
              enabled={(info as any).enabled}
            />
          ))
        ) : (
          <ConnectorCard name="Loading..." ok={false} />
        )}
      </div>
    </div>
  );
}
