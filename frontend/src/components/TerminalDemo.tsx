import { useEffect, useRef, useState } from 'react';

const LINES = [
  { t: 'in', text: 'I think BTC holds above $95k through the weekend.' },
  { t: 'sys', text: 'Scanning BNB Chain prediction markets...' },
  { t: 'sys', text: 'Found 2 matching markets across Predict.fun and Opinion.' },
  { t: 'br', text: '' },
  { t: 'head', text: 'MARKET ANALYSIS' },
  { t: 'br', text: '' },
  { t: 'data', text: '  Platform     │ YES Price │ Implied │ Liquidity' },
  { t: 'data', text: '  ─────────────┼───────────┼─────────┼──────────' },
  { t: 'data', text: '  Predict.fun  │ $0.62     │ 62%     │ $12.4k' },
  { t: 'data', text: '  Opinion      │ $0.58     │ 58%     │ $8.1k' },
  { t: 'br', text: '' },
  { t: 'head', text: 'RESEARCH FINDINGS' },
  { t: 'br', text: '' },
  { t: 'data', text: '  Supporting:' },
  { t: 'good', text: '    • BTC held $94.8k support three times this week' },
  { t: 'good', text: '    • ETF inflows $340M net positive last 5 sessions' },
  { t: 'good', text: '    • On-chain accumulation by long-term holders rising' },
  { t: 'data', text: '  Contradicting:' },
  { t: 'warn', text: '    • FOMC minutes release Friday — vol catalyst' },
  { t: 'warn', text: '    • Funding rates elevated on major exchanges' },
  { t: 'br', text: '' },
  { t: 'head', text: 'STATISTICAL EVALUATION' },
  { t: 'br', text: '' },
  { t: 'data', text: '  Model Probability:  71%' },
  { t: 'data', text: '  Market Probability: 58% (Opinion — best price)' },
  { t: 'good', text: '  Edge:               +13.0%' },
  { t: 'good', text: '  Expected Value:     +$0.22 per $1 risked' },
  { t: 'data', text: '  Confidence:         Medium-High' },
  { t: 'data', text: '  Risk Score:         6/10' },
  { t: 'br', text: '' },
  { t: 'gold', text: '  >> BUY YES on Opinion at $0.58 (+13% edge)' },
  { t: 'warn', text: '  !! ARB: Cross-platform spread $0.04 — buy YES on Opinion + NO on Predict.fun' },
  { t: 'br', text: '' },
  { t: 'data', text: '  Options:' },
  { t: 'data', text: '  1. Directional — Buy YES on Opinion at $0.58' },
  { t: 'data', text: '  2. Arb + Directional — Lock $0.04/share risk-free + hold upside' },
  { t: 'br', text: '' },
  { t: 'in', text: 'Execute option 1, 200 shares' },
  { t: 'sys', text: 'Placing order: 200 YES @ $0.58 on Opinion...' },
  { t: 'br', text: '' },
  { t: 'good', text: '  Order ID: 0x7a3f...c91e' },
  { t: 'good', text: '  Status: submitted' },
  { t: 'good', text: '  Filled: 200 shares @ $0.58 — Cost: $116.00' },
  { t: 'good', text: '  Potential Payout: $200.00' },
  { t: 'data', text: '  Position tracked. Use "show my positions" to view portfolio.' },
];

const C: Record<string, string> = {
  in: 'var(--gold)',
  sys: 'var(--t3)',
  head: 'var(--cyan)',
  data: 'var(--t2)',
  good: 'var(--green)',
  warn: 'var(--red)',
  gold: 'var(--gold)',
  br: 'transparent',
};

export function TerminalDemo() {
  const [n, setN] = useState(0);
  const [started, setStarted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting && !started) setStarted(true); },
      { threshold: 0.2 }
    );
    if (wrapRef.current) obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    if (n >= LINES.length) {
      const t = setTimeout(() => setN(0), 6000);
      return () => clearTimeout(t);
    }
    const delay = LINES[n]?.t === 'in' ? 1100 : LINES[n]?.t === 'br' ? 60 : 220;
    const t = setTimeout(() => setN(v => v + 1), delay);
    return () => clearTimeout(t);
  }, [n, started]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [n]);

  return (
    <div ref={wrapRef} style={{
      background: '#0d0d0d',
      border: '1px solid var(--line)',
      borderRadius: 2,
      overflow: 'hidden',
      maxWidth: 720,
      width: '100%',
    }}>
      {/* Chrome */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: '1px solid var(--line)',
        gap: 6,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5f56', opacity: 0.8 }} />
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffbd2e', opacity: 0.8 }} />
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#27c93f', opacity: 0.8 }} />
        <span style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'var(--t3)',
          marginLeft: 10,
          letterSpacing: '0.04em',
        }}>
          flash — live session
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'var(--green)',
            animation: 'pulse-dot 2s ease infinite',
          }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)', letterSpacing: '0.05em' }}>
            LIVE
          </span>
        </div>
      </div>

      {/* Body */}
      <div ref={bodyRef} style={{
        padding: '16px 18px',
        fontFamily: 'var(--mono)',
        fontSize: 12,
        lineHeight: 1.9,
        height: 380,
        overflowY: 'auto',
      }}>
        {LINES.slice(0, n).map((line, i) => (
          <div key={i} style={{
            color: C[line.t],
            fontWeight: line.t === 'good' || line.t === 'gold' || line.t === 'warn' || line.t === 'head' ? 600 : 400,
            whiteSpace: 'pre',
            letterSpacing: line.t === 'head' ? '0.12em' : '0.01em',
            fontSize: line.t === 'head' ? 11 : 12,
            animation: 'fadeUp 0.2s ease forwards',
          }}>
            {line.t === 'in' ? `> ${line.text}` : line.t === 'br' ? '\u00A0' : line.text}
          </div>
        ))}
        {n > 0 && n < LINES.length && (
          <span style={{
            display: 'inline-block',
            width: 6.5,
            height: 14,
            background: 'var(--gold)',
            animation: 'blink 1s step-end infinite',
            verticalAlign: 'middle',
          }} />
        )}
      </div>
    </div>
  );
}
