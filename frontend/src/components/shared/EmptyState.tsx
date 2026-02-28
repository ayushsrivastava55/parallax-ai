import type { CSSProperties } from 'react';

const wrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '48px 24px',
  gap: 12,
  color: 'var(--t3)',
  textAlign: 'center',
};

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={wrap}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 14 }}>{title}</span>
      {subtitle && <span style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--t3)' }}>{subtitle}</span>}
    </div>
  );
}
