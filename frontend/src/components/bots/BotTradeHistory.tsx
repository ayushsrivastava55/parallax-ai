import type { CSSProperties } from 'react';
import type { ActivityEvent } from '../../lib/constants.ts';
import { Timestamp } from '../shared/Timestamp.tsx';
import { EmptyState } from '../shared/EmptyState.tsx';

const wrap: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 8,
  overflow: 'hidden',
  marginBottom: 24,
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

export function BotTradeHistory({ activity }: { activity: ActivityEvent[] }) {
  const trades = activity.filter((e) => e.type === 'trades.execute' || e.type === 'trades.quote');

  return (
    <div style={wrap}>
      <div style={header}>Trade History</div>
      {!trades.length ? (
        <EmptyState title="No trades yet" />
      ) : (
        trades.map((e) => (
          <div key={e.id} style={row}>
            <Timestamp iso={e.timestamp} />
            <span style={{ color: e.type === 'trades.execute' ? 'var(--green)' : 'var(--cyan)' }}>{e.type}</span>
            <span style={{ color: 'var(--t3)' }}>
              {e.details.status ? String(e.details.status) : ''}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
