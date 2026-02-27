import { useEffect, useState } from 'react';

const MARKETS = [
  { name: 'BTC > $95k Mar 1', price: 0.62, delta: 3.2, src: 'PF' },
  { name: 'ETH > $4k Mar 5', price: 0.38, delta: -1.8, src: 'OP' },
  { name: 'Fed Hold Mar', price: 0.91, delta: 0.5, src: 'PF' },
  { name: 'BNB > $700', price: 0.45, delta: 5.1, src: 'OP' },
  { name: 'SOL > $200 Mar 10', price: 0.29, delta: -2.4, src: 'PF' },
  { name: 'XRP ETF 2026', price: 0.34, delta: 4.2, src: 'OP' },
  { name: 'India Rate Cut', price: 0.55, delta: 0.8, src: 'PF' },
  { name: 'BTC > $100k Apr', price: 0.21, delta: -0.6, src: 'OP' },
];

export function LiveTicker() {
  const [items, setItems] = useState(MARKETS);

  useEffect(() => {
    const interval = setInterval(() => {
      setItems(prev =>
        prev.map(m => ({
          ...m,
          price: Math.max(0.01, Math.min(0.99, m.price + (Math.random() - 0.5) * 0.012)),
          delta: +(m.delta + (Math.random() - 0.5) * 0.3).toFixed(1),
        }))
      );
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  const doubled = [...items, ...items];

  return (
    <div style={{
      borderTop: '1px solid var(--line)',
      borderBottom: '1px solid var(--line)',
      padding: '9px 0',
      overflow: 'hidden',
      background: 'var(--bg)',
    }}>
      <div style={{
        display: 'flex',
        gap: 36,
        animation: 'ticker 30s linear infinite',
        width: 'max-content',
        fontFamily: 'var(--mono)',
        fontSize: 11,
      }}>
        {doubled.map((m, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--t3)', fontSize: 9, letterSpacing: '0.06em' }}>{m.src}</span>
            <span style={{ color: 'var(--t2)' }}>{m.name}</span>
            <span style={{ color: 'var(--gold)', fontWeight: 600 }}>${m.price.toFixed(2)}</span>
            <span style={{ color: m.delta >= 0 ? 'var(--green)' : 'var(--red)', fontSize: 10 }}>
              {m.delta >= 0 ? '+' : ''}{m.delta}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
