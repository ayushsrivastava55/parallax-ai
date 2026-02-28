import type { CSSProperties } from 'react';

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 8,
  padding: 20,
  display: 'flex',
  alignItems: 'center',
  gap: 16,
};

export function ConnectorCard({
  name,
  ok,
  error,
  enabled,
}: {
  name: string;
  ok: boolean;
  error?: string;
  enabled?: boolean;
}) {
  const dotColor = ok ? 'var(--green)' : enabled === false ? 'var(--t3)' : 'var(--red)';

  return (
    <div style={card}>
      <span style={{ width: 12, height: 12, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--t1)', marginBottom: 4 }}>{name}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t3)' }}>
          {ok ? 'Connected' : enabled === false ? 'Disabled' : error ?? 'Unavailable'}
        </div>
      </div>
    </div>
  );
}
