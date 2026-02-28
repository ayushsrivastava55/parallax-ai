import type { CSSProperties } from 'react';
import { useState } from 'react';

const wrap: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 8,
  padding: 20,
  marginBottom: 24,
};

const codeBlock: CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--line)',
  borderRadius: 4,
  padding: 16,
  fontFamily: 'var(--mono)',
  fontSize: 12,
  lineHeight: 1.7,
  color: 'var(--t1)',
  whiteSpace: 'pre-wrap',
  overflowX: 'auto',
};

const INSTALL_CMD = `mkdir -p ~/.openclaw/skills/flash-gateway
curl -sL https://eyebalz.xyz/skill.md > ~/.openclaw/skills/flash-gateway/SKILL.md
curl -sL https://eyebalz.xyz/skill.json > ~/.openclaw/skills/flash-gateway/package.json
curl -sL https://eyebalz.xyz/heartbeat.md > ~/.openclaw/skills/flash-gateway/HEARTBEAT.md
curl -sL https://eyebalz.xyz/strategy-playbook.md > ~/.openclaw/skills/flash-gateway/STRATEGY_PLAYBOOK.md
curl -sL https://eyebalz.xyz/strategy-delta-neutral.md > ~/.openclaw/skills/flash-gateway/STRATEGY_DELTA_NEUTRAL.md
curl -sL https://eyebalz.xyz/strategy-thesis.md > ~/.openclaw/skills/flash-gateway/STRATEGY_THESIS.md
curl -sL https://eyebalz.xyz/strategy-yield.md > ~/.openclaw/skills/flash-gateway/STRATEGY_YIELD.md
curl -sL https://eyebalz.xyz/skill-market-intel.md > ~/.openclaw/skills/flash-gateway/MARKET_INTEL.md
curl -sL https://eyebalz.xyz/skill-trading.md > ~/.openclaw/skills/flash-gateway/TRADING.md
curl -sL https://eyebalz.xyz/skill-portfolio.md > ~/.openclaw/skills/flash-gateway/PORTFOLIO.md
curl -sL https://eyebalz.xyz/skill-identity.md > ~/.openclaw/skills/flash-gateway/IDENTITY.md
curl -sL https://eyebalz.xyz/messaging.md > ~/.openclaw/skills/flash-gateway/MESSAGING.md
curl -sL https://eyebalz.xyz/rules.md > ~/.openclaw/skills/flash-gateway/RULES.md`;

export function SkillInstaller() {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(INSTALL_CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, textTransform: 'uppercase', color: 'var(--t2)', letterSpacing: '0.06em' }}>
          Install Command
        </span>
        <button
          onClick={copy}
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: copied ? 'var(--green)' : 'var(--t2)',
            background: 'var(--line)',
            border: 'none',
            borderRadius: 4,
            padding: '4px 10px',
            cursor: 'pointer',
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre style={codeBlock}>{INSTALL_CMD}</pre>
    </div>
  );
}
