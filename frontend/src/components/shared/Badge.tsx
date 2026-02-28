import type { CSSProperties } from 'react';

export function Badge({ label, color }: { label: string; color: string }) {
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: 'var(--mono)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color,
    background: `${color}11`,
    border: `1px solid ${color}33`,
    borderRadius: 4,
    padding: '3px 8px',
  };

  return (
    <span style={style}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {label}
    </span>
  );
}
