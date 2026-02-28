import type { CSSProperties } from 'react';
import { usePlatformStats } from '../../hooks/usePlatformStats.ts';

const bar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 24px',
  borderBottom: '1px solid var(--line)',
  background: 'var(--surface)',
};

const left: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};

const right: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  fontFamily: 'var(--mono)',
  fontSize: 12,
  color: 'var(--t2)',
};

const pill: CSSProperties = {
  padding: '3px 10px',
  borderRadius: 4,
  fontSize: 11,
  fontFamily: 'var(--mono)',
};

export function TopBar() {
  const { data } = usePlatformStats();

  const healthOk = data
    ? Object.values(data.connectorHealth).some(Boolean)
    : false;

  return (
    <div style={bar}>
      <div style={left}>
        <span style={{ fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--gold)' }}>Flash Gateway</span>
      </div>
      <div style={right}>
        {data && <span>{data.activeBots} bot{data.activeBots !== 1 ? 's' : ''} active</span>}
        <span
          style={{
            ...pill,
            color: healthOk ? 'var(--green)' : 'var(--red)',
            background: healthOk ? '#4ade8011' : '#f8717111',
            border: `1px solid ${healthOk ? '#4ade8033' : '#f8717133'}`,
          }}
        >
          {healthOk ? 'OK' : 'DOWN'}
        </span>
      </div>
    </div>
  );
}
