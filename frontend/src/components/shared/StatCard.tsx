import type { CSSProperties } from 'react';

const wrap: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 8,
  padding: '20px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const labelStyle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--t3)',
};

const valueStyle: CSSProperties = {
  fontFamily: 'var(--serif)',
  fontSize: 28,
  fontWeight: 400,
  color: 'var(--t1)',
  lineHeight: 1.1,
};

export function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      ...wrap,
      borderLeft: accent ? `3px solid ${accent}` : '1px solid var(--line)',
    }}>
      <span style={labelStyle}>{label}</span>
      <span style={{ ...valueStyle, color: accent ?? 'var(--t1)' }}>{value}</span>
    </div>
  );
}
