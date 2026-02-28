import { useEffect, useState } from 'react';

interface YieldStatusData {
  provider: 'venus';
  suppliedUsd: number;
  availableIdleUsd: number;
  estApyBps: number;
  updatedAt: string;
}

export function YieldStatus() {
  const [status, setStatus] = useState<YieldStatusData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch('/api/eyebalz/yield-status');
        if (!res.ok) throw new Error('not ok');
        const json = await res.json();
        if (mounted && json.success && json.data) {
          setStatus(json.data);
        }
      } catch {
        // Keep previous state
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
        YIELD ROTATION
      </div>
      {loading && !status ? (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t3)' }}>Loading yield status...</div>
      ) : !status ? (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t3)' }}>Agent offline. Yield status unavailable.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t3)' }}>PROVIDER</div>
            <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--t1)' }}>{status.provider.toUpperCase()}</div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t3)' }}>EST APY</div>
            <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--green)' }}>
              {(status.estApyBps / 100).toFixed(2)}%
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t3)' }}>SUPPLIED</div>
            <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--t1)' }}>
              ${status.suppliedUsd.toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t3)' }}>IDLE</div>
            <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--t1)' }}>
              ${status.availableIdleUsd.toFixed(2)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
