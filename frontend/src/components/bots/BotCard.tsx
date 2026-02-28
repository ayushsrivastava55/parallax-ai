import { Link } from 'react-router-dom';
import type { CSSProperties } from 'react';
import type { BotRecord } from '../../lib/constants.ts';
import { STATUS_COLORS } from '../../lib/constants.ts';
import { Badge } from '../shared/Badge.tsx';
import { Timestamp } from '../shared/Timestamp.tsx';
import { formatUsd, shortId } from '../../lib/formatters.ts';

const card: CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--line)',
  borderRadius: 8,
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  textDecoration: 'none',
  color: 'inherit',
  transition: 'border-color 0.15s',
};

const row: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const mono: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 12,
  color: 'var(--t2)',
};

export function BotCard({ bot }: { bot: BotRecord }) {
  return (
    <Link to={`/bots/${bot.agentId}`} style={card}>
      <div style={row}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--t1)' }}>
          {shortId(bot.agentId)}
        </span>
        <Badge label={bot.status} color={STATUS_COLORS[bot.status]} />
      </div>
      <div style={row}>
        <span style={mono}>{bot.totalTrades} trades</span>
        <span style={mono}>{formatUsd(bot.totalVolume)}</span>
      </div>
      <div style={row}>
        <span style={mono}>{bot.totalRequests} requests</span>
        <Timestamp iso={bot.lastSeenAt} />
      </div>
      {bot.activeStrategies.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {bot.activeStrategies.map((s) => (
            <span
              key={s}
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: 'var(--t3)',
                background: 'var(--line)',
                padding: '2px 6px',
                borderRadius: 3,
              }}
            >
              {s}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
