import { useState } from 'react';
import { SKILL_FILES } from '../lib/constants.ts';
import { SkillInstaller } from '../components/skills/SkillInstaller.tsx';
import { SkillViewer } from '../components/skills/SkillViewer.tsx';
import type { CSSProperties } from 'react';

const fileList: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: 12,
  marginBottom: 24,
};

const fileBtn = (active: boolean): CSSProperties => ({
  background: active ? 'var(--gold-dim)' : 'var(--surface)',
  border: `1px solid ${active ? 'var(--gold)33' : 'var(--line)'}`,
  borderRadius: 8,
  padding: '12px 16px',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'border-color 0.15s',
});

export default function Skills() {
  const [selected, setSelected] = useState('skill.md');

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, color: 'var(--t1)', marginBottom: 8 }}>
        Skill Files
      </h1>
      <p style={{ fontFamily: 'var(--sans)', fontSize: 14, color: 'var(--t2)', marginBottom: 24, lineHeight: 1.5 }}>
        OpenClaw bots install these skill files to learn how to use Flash Gateway autonomously.
      </p>

      <SkillInstaller />

      <div style={fileList}>
        {SKILL_FILES.map((f) => (
          <button key={f.name} onClick={() => setSelected(f.name)} style={fileBtn(selected === f.name)}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: selected === f.name ? 'var(--gold)' : 'var(--t1)', marginBottom: 4 }}>
              {f.name}
            </div>
            <div style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--t3)' }}>
              {f.description}
            </div>
          </button>
        ))}
      </div>

      <SkillViewer filename={selected} />
    </div>
  );
}
