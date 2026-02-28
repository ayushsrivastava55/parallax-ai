import { useEffect, useState } from 'react';

interface Bundle {
  bundleId: string;
  marketTitle: string;
  expectedTotalProfit: number;
  expectedProfitPercent: number;
  status: 'planned' | 'executing' | 'success' | 'partial_unwound' | 'failed';
  updatedAt: string;
}

function statusColor(status: Bundle['status']): string {
  if (status === 'success') return 'var(--green)';
  if (status === 'partial_unwound') return 'var(--gold)';
  if (status === 'failed') return 'var(--red)';
  return 'var(--t2)';
}

export function BundleMonitor() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch('/api/eyebalz/bundles?limit=5');
        if (!res.ok) throw new Error('not ok');
        const json = await res.json();
        if (mounted && json.success && Array.isArray(json.data)) {
          setBundles(json.data);
        }
      } catch {
        // Keep previous data
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    const poll = setInterval(load, 30000);
    return () => {
      mounted = false;
      clearInterval(poll);
    };
  }, []);

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 2, padding: 16, background: '#0d0d0d' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)', letterSpacing: '0.08em', marginBottom: 12 }}>
        DELTA-NEUTRAL BUNDLES
      </div>
      {loading && bundles.length === 0 ? (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t3)' }}>Loading bundle telemetry...</div>
      ) : bundles.length === 0 ? (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t3)' }}>No bundles yet. Trigger "execute arb".</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {bundles.map((b) => (
            <div key={b.bundleId} style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
              <div style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--t1)', marginBottom: 3 }}>{b.marketTitle}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: statusColor(b.status), marginBottom: 4 }}>
                {b.status.toUpperCase()}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t2)' }}>
                EV ${b.expectedTotalProfit.toFixed(2)} ({b.expectedProfitPercent.toFixed(2)}%)
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
