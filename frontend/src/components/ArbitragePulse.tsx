import { useState, useEffect } from 'react';

const ARBS = [
  {
    market: 'ETH > $4,000 by March',
    a: { platform: 'Opinion', side: 'YES', price: 0.42 },
    b: { platform: 'Predict.fun', side: 'NO', price: 0.55 },
    combined: 0.97,
    profit: '3.1',
  },
  {
    market: 'Fed Rate Hold March',
    a: { platform: 'Predict.fun', side: 'YES', price: 0.91 },
    b: { platform: 'Opinion', side: 'NO', price: 0.07 },
    combined: 0.98,
    profit: '2.0',
  },
  {
    market: 'BTC > $100k by April',
    a: { platform: 'Opinion', side: 'YES', price: 0.31 },
    b: { platform: 'Predict.fun', side: 'NO', price: 0.65 },
    combined: 0.96,
    profit: '4.2',
  },
];

export function ArbitragePulse() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const i = setInterval(() => setActive(a => (a + 1) % ARBS.length), 3500);
    return () => clearInterval(i);
  }, []);

  return (
    <div style={{
      border: '1px solid var(--line)',
      borderRadius: 2,
      background: '#0d0d0d',
      overflow: 'hidden',
      width: '100%',
      maxWidth: 460,
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--line)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <div style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: 'var(--green)',
          animation: 'pulse-dot 2s ease infinite',
        }} />
        <span style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--green)',
          letterSpacing: '0.1em',
        }}>
          ARB SCANNER
        </span>
        <span style={{
          fontFamily: 'var(--mono)',
          fontSize: 9,
          color: 'var(--t3)',
          marginLeft: 'auto',
        }}>
          {ARBS.length} found
        </span>
      </div>

      {/* Opportunities */}
      <div style={{ padding: '8px' }}>
        {ARBS.map((arb, i) => {
          const isActive = i === active;
          return (
            <div key={i} style={{
              padding: '12px',
              borderRadius: 2,
              marginBottom: i < ARBS.length - 1 ? 4 : 0,
              background: isActive ? 'var(--gold-dim)' : 'transparent',
              borderLeft: isActive ? '2px solid var(--gold)' : '2px solid transparent',
              opacity: isActive ? 1 : 0.35,
              transition: 'all 0.4s ease',
            }}>
              <div style={{
                fontFamily: 'var(--sans)',
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 8,
                color: 'var(--t1)',
              }}>
                {arb.market}
              </div>

              <div style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr auto',
                gap: 8,
                alignItems: 'center',
              }}>
                <div>
                  <div style={{ color: 'var(--t3)', fontSize: 9, letterSpacing: '0.05em' }}>{arb.a.platform}</div>
                  <div style={{ color: 'var(--cyan)' }}>{arb.a.side} ${arb.a.price.toFixed(2)}</div>
                </div>
                <span style={{ color: 'var(--t3)', fontSize: 14 }}>+</span>
                <div>
                  <div style={{ color: 'var(--t3)', fontSize: 9, letterSpacing: '0.05em' }}>{arb.b.platform}</div>
                  <div style={{ color: 'var(--red)' }}>{arb.b.side} ${arb.b.price.toFixed(2)}</div>
                </div>
                <div style={{
                  fontWeight: 700,
                  fontSize: 14,
                  color: 'var(--green)',
                  textAlign: 'right',
                }}>
                  +{arb.profit}%
                </div>
              </div>

              {isActive && (
                <div style={{
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: '1px solid var(--line)',
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  color: 'var(--t3)',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}>
                  <span>cost ${arb.combined.toFixed(2)}</span>
                  <span>payout $1.00</span>
                  <span style={{ color: 'var(--green)' }}>risk-free</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
