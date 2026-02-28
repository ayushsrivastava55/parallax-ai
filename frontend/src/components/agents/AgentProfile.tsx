import type { CSSProperties } from 'react';
import type { AgentRecord, AgentStats } from '../../lib/constants.ts';
import { STATUS_COLORS } from '../../lib/constants.ts';
import { Badge } from '../shared/Badge.tsx';
import { StatCard } from '../shared/StatCard.tsx';
import { formatUsd, formatPercent, timeAgo } from '../../lib/formatters.ts';

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  marginBottom: 24,
};

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 12,
  marginBottom: 24,
};

export function AgentProfile({ agent, stats }: { agent: AgentRecord; stats: AgentStats | null }) {
  return (
    <div>
      <div style={header}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 20, color: 'var(--t1)' }}>{agent.agentId}</span>
        <Badge label={agent.status} color={STATUS_COLORS[agent.status]} />
      </div>
      <div style={grid}>
        <StatCard label="Trades" value={stats ? String(stats.totalTrades) : String(agent.totalTrades)} accent="var(--gold)" />
        <StatCard label="Volume" value={formatUsd(stats?.totalVolume ?? agent.totalVolume)} accent="var(--cyan)" />
        <StatCard label="Win Rate" value={stats ? formatPercent(stats.winRate) : '-'} accent="var(--green)" />
        <StatCard label="P&L" value={stats ? formatUsd(stats.totalPnl) : '-'} accent={stats && stats.totalPnl >= 0 ? 'var(--green)' : 'var(--red)'} />
        <StatCard label="Heartbeats" value={stats ? String(stats.heartbeatsReceived) : '-'} />
        <StatCard label="Last Seen" value={timeAgo(agent.lastSeenAt)} />
      </div>
    </div>
  );
}
