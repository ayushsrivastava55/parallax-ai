import { useParams, Link } from 'react-router-dom';
import { STRATEGIES } from '../lib/constants.ts';
import { SkillViewer } from '../components/skills/SkillViewer.tsx';
import { EmptyState } from '../components/shared/EmptyState.tsx';
import { useBots } from '../hooks/useBots.ts';
import { BotCard } from '../components/bots/BotCard.tsx';
import type { CSSProperties } from 'react';

const botGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 16,
  marginBottom: 24,
};

export default function StrategyDetail() {
  const { strategyId } = useParams<{ strategyId: string }>();
  const strategy = STRATEGIES.find((s) => s.id === strategyId);
  const { data: bots } = useBots();

  if (!strategy) return <EmptyState title="Strategy not found" />;

  const botsRunning = (bots ?? []).filter((b) => b.activeStrategies.includes(strategy.id));

  return (
    <div>
      <Link
        to="/strategies"
        style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--t3)', textDecoration: 'none', marginBottom: 16, display: 'inline-block' }}
      >
        &larr; All Strategies
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: strategy.color }} />
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, color: 'var(--t1)', margin: 0 }}>{strategy.name}</h1>
      </div>
      <p style={{ fontFamily: 'var(--sans)', fontSize: 14, color: 'var(--t2)', marginBottom: 24, lineHeight: 1.5 }}>
        {strategy.description}
      </p>

      {botsRunning.length > 0 && (
        <>
          <h2 style={{ fontFamily: 'var(--mono)', fontSize: 13, textTransform: 'uppercase', color: 'var(--t2)', marginBottom: 12 }}>
            Bots Running This Strategy
          </h2>
          <div style={botGrid}>
            {botsRunning.map((b) => <BotCard key={b.agentId} bot={b} />)}
          </div>
        </>
      )}

      <SkillViewer filename={strategy.skillFile} />
    </div>
  );
}
