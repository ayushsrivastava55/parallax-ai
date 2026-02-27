import { useEffect, useState } from 'react';

interface TickerItem {
  name: string;
  price: number;
  delta: number;
  src: string;
}

async function fetchRealMarkets(): Promise<TickerItem[]> {
  const res = await fetch('/pfapi/v1/markets?first=10');
  if (!res.ok) throw new Error('API error');
  const data = await res.json();
  if (!data.success || !data.data?.length) throw new Error('No data');

  const items: TickerItem[] = [];
  for (const m of data.data) {
    if (m.tradingStatus !== 'OPEN') continue;
    const title = (m.question || m.title || '').slice(0, 35);

    let price = 0.5;
    try {
      const obRes = await fetch(`/pfapi/v1/markets/${m.id}/orderbook`);
      if (obRes.ok) {
        const ob = await obRes.json();
        if (ob.data) {
          const bestBid = ob.data.bids?.[0]?.[0] ?? 0;
          const bestAsk = ob.data.asks?.[0]?.[0] ?? 1;
          price = (bestBid + bestAsk) / 2;
        }
      }
    } catch {
      // Use 0.5 default
    }

    items.push({ name: title, price, delta: 0, src: 'PF' });
    if (items.length >= 8) break;
  }

  if (items.length === 0) {
    throw new Error('No open markets returned from Predict.fun');
  }
  return items;
}

export function LiveTicker() {
  const [items, setItems] = useState<TickerItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const real = await fetchRealMarkets();
        if (!mounted) return;
        setError(null);

        // Compute delta from previous fetch
        setItems(prev => {
          const oldMap = new Map(prev.map(m => [m.name, m.price]));
          return real.map(m => {
            const oldPrice = oldMap.get(m.name);
            const delta = oldPrice != null && oldPrice > 0
              ? +((m.price - oldPrice) / oldPrice * 100).toFixed(1)
              : 0;
            return { ...m, delta };
          });
        });
      } catch {
        if (!mounted) return;
        setError('Live market feed unavailable. Check Predict.fun API connectivity.');
      }
    };

    load();
    const poll = setInterval(load, 30000);
    return () => { mounted = false; clearInterval(poll); };
  }, []);

  if (error) {
    return (
      <div style={{
        borderTop: '1px solid var(--line)',
        borderBottom: '1px solid var(--line)',
        padding: '9px 16px',
        overflow: 'hidden',
        background: 'var(--bg)',
        fontFamily: 'var(--mono)',
        fontSize: 11,
        color: 'var(--red)',
      }}>
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{
        borderTop: '1px solid var(--line)',
        borderBottom: '1px solid var(--line)',
        padding: '9px 16px',
        overflow: 'hidden',
        background: 'var(--bg)',
        fontFamily: 'var(--mono)',
        fontSize: 11,
        color: 'var(--t3)',
      }}>
        Loading live markets from Predict.fun...
      </div>
    );
  }

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
