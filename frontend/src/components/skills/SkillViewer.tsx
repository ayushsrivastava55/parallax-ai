import type { CSSProperties } from 'react';
import { useSkillFile } from '../../hooks/useSkillFile.ts';

const wrap: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 8,
  overflow: 'hidden',
};

const header: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '14px 20px',
  borderBottom: '1px solid var(--line)',
};

const content: CSSProperties = {
  padding: 20,
  fontFamily: 'var(--mono)',
  fontSize: 13,
  lineHeight: 1.7,
  color: 'var(--t1)',
  whiteSpace: 'pre-wrap',
  maxHeight: 600,
  overflowY: 'auto',
};

export function SkillViewer({ filename }: { filename: string }) {
  const { data, loading, error } = useSkillFile(filename);

  return (
    <div style={wrap}>
      <div style={header}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--gold)' }}>{filename}</span>
        <a
          href={`/${filename}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t3)', textDecoration: 'none' }}
        >
          raw
        </a>
      </div>
      <div style={content}>
        {loading && 'Loading...'}
        {error && `Error: ${error}`}
        {data && data}
      </div>
    </div>
  );
}
