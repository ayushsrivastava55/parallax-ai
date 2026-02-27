import { useState, useEffect } from 'react';

interface ArbData {
  market: string;
  a: { platform: string; side: string; price: number };
  b: { platform: string; side: string; price: number };
  combined: number;
  profit: string;
}

function platformLabel(p: string): string {
  return p === 'predictfun' ? 'Predict.fun' : p === 'opinion' ? 'Opinion' : p;
}

function mapApiToArbs(apiData: any[]): ArbData[] {
  return apiData.slice(0, 5).map((opp) => {
    const legs = opp.legs || [];
    const legA = legs[0] || {};
    const legB = legs[1] || {};
    return {
      market: opp.marketTitle || 'Unknown Market',
      a: {
        platform: platformLabel(legA.platform || ''),
        side: legA.outcome || 'YES',
        price: legA.price || 0,
      },
      b: {
        platform: platformLabel(legB.platform || ''),
        side: legB.outcome || 'NO',
        price: legB.price || 0,
      },
      combined: opp.totalCost || 0,
      profit: (opp.profitPercent || 0).toFixed(1),
    };
  });
}

export function ArbitragePulse() {
  const [arbs, setArbs] = useState<ArbData[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch real arb data from agent
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await fetch('/api/flash/arb-scan');
        if (!res.ok) throw new Error('not ok');
        const json = await res.json();
        if (!mounted) return;
        if (json.success && json.data?.length > 0) {
          setArbs(mapApiToArbs(json.data));
          setError(null);
        } else {
          setArbs([]);
          setError('No live arb opportunities returned.');
        }
      } catch {
        if (!mounted) return;
        setArbs([]);
        setError('Arb scan unavailable. Start agent and verify /api/flash/arb-scan.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    const poll = setInterval(load, 30000);
    return () => { mounted = false; clearInterval(poll); };
  }, []);

  // Cycle active item
  useEffect(() => {
    if (arbs.length === 0) return;
    const i = setInterval(() => setActive(a => (a + 1) % arbs.length), 3500);
    return () => clearInterval(i);
  }, [arbs.length]);

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
          background: arbs.length > 0 ? 'var(--green)' : 'var(--t3)',
          animation: arbs.length > 0 ? 'pulse-dot 2s ease infinite' : 'none',
        }} />
        <span style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          fontWeight: 600,
          color: arbs.length > 0 ? 'var(--green)' : 'var(--t3)',
          letterSpacing: '0.1em',
        }}>
          ARB SCANNER{arbs.length > 0 ? ' — LIVE' : ''}
        </span>
        <span style={{
          fontFamily: 'var(--mono)',
          fontSize: 9,
          color: 'var(--t3)',
          marginLeft: 'auto',
        }}>
          {arbs.length > 0 ? `${arbs.length} found` : loading ? 'scanning...' : 'connect agent to scan'}
        </span>
      </div>

      {/* Opportunities */}
      <div style={{ padding: '8px' }}>
        {arbs.length === 0 ? (
          <div style={{
            padding: '20px 12px',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--t3)',
            textAlign: 'center',
          }}>
            {loading
              ? 'Scanning cross-platform opportunities...'
              : error || 'Start agent to scan for arbitrage opportunities'}
          </div>
        ) : (
          arbs.map((arb, i) => {
            const isActive = i === active;
            return (
              <div key={i} style={{
                padding: '12px',
                borderRadius: 2,
                marginBottom: i < arbs.length - 1 ? 4 : 0,
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
          })
        )}
      </div>
    </div>
  );
}
