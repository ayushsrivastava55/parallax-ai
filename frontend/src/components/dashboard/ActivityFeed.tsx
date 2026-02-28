import { useActivityFeed } from '../../hooks/useActivityFeed.ts';
import { Timestamp } from '../shared/Timestamp.tsx';
import { EmptyState } from '../shared/EmptyState.tsx';
import { shortId } from '../../lib/formatters.ts';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';

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
  gridTemplateColumns: '100px 120px 1fr auto',
  alignItems: 'center',
  gap: 12,
  padding: '10px 20px',
  borderBottom: '1px solid var(--line)',
  fontSize: 13,
  fontFamily: 'var(--mono)',
};

const typeColors: Record<string, string> = {
  'trades.execute': 'var(--green)',
  'trades.quote': 'var(--cyan)',
  'arb.scan': 'var(--cyan)',
  heartbeat: 'var(--gold)',
  'markets.list': 'var(--t2)',
  'markets.analyze': 'var(--t2)',
};

export function ActivityFeed() {
  const { data, loading } = useActivityFeed(20);

  if (loading && !data) {
    return <div style={wrap}><div style={header}>Activity Feed</div><EmptyState title="Loading..." /></div>;
  }

  return (
    <div style={wrap}>
      <div style={header}>Activity Feed</div>
      {!data?.length ? (
        <EmptyState title="No activity yet" subtitle="Activity will appear when bots start making requests" />
      ) : (
        data.map((e) => (
          <div key={e.id} style={row}>
            <Timestamp iso={e.timestamp} />
            <Link
              to={`/bots/${e.agentId}`}
              style={{ color: 'var(--gold)', textDecoration: 'none', fontSize: 12 }}
            >
              {shortId(e.agentId)}
            </Link>
            <span style={{ color: typeColors[e.type] ?? 'var(--t2)' }}>{e.type}</span>
            <span style={{ color: 'var(--t3)', fontSize: 11 }}>
              {e.details.status ? String(e.details.status) : ''}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
