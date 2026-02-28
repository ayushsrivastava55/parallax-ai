import { Link } from 'react-router-dom';
import type { CSSProperties } from 'react';
import type { StrategyDef } from '../../lib/constants.ts';

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 8,
  padding: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  textDecoration: 'none',
  color: 'inherit',
  transition: 'border-color 0.15s',
};

export function StrategyCard({ strategy }: { strategy: StrategyDef }) {
  return (
    <Link to={`/strategies/${strategy.id}`} style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: strategy.color,
          }}
        />
        <span style={{ fontFamily: 'var(--sans)', fontSize: 16, fontWeight: 600, color: 'var(--t1)' }}>
          {strategy.name}
        </span>
      </div>
      <p style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--t2)', lineHeight: 1.5, margin: 0 }}>
        {strategy.description}
      </p>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t3)' }}>
        {strategy.skillFile}
      </span>
    </Link>
  );
}
