import { STRATEGIES } from '../lib/constants.ts';
import { StrategyCard } from '../components/strategies/StrategyCard.tsx';
import type { CSSProperties } from 'react';

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: 16,
};

export default function Strategies() {
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, color: 'var(--t1)', marginBottom: 8 }}>
        Strategies
      </h1>
      <p style={{ fontFamily: 'var(--sans)', fontSize: 14, color: 'var(--t2)', marginBottom: 24, lineHeight: 1.5 }}>
        Strategy playbooks that autonomous agents can run. Each strategy has a skill file with full instructions.
      </p>
      <div style={grid}>
        {STRATEGIES.map((s) => (
          <StrategyCard key={s.id} strategy={s} />
        ))}
      </div>
    </div>
  );
}
