/* ── Types (mirrors gateway/types.ts for frontend) ────────────── */

export type AgentStatus = 'active' | 'idle' | 'stale';

export interface AgentRecord {
  agentId: string;
  keyId: string;
  registeredAt: string;
  lastSeenAt: string;
  lastHeartbeatAt: string | null;
  totalRequests: number;
  totalTrades: number;
  totalVolume: number;
  activeStrategies: string[];
  status: AgentStatus;
}

export interface ActivityEvent {
  id: string;
  agentId: string;
  type: string;
  timestamp: string;
  details: Record<string, unknown>;
}

export interface AgentStats {
  agentId: string;
  totalTrades: number;
  successfulTrades: number;
  totalVolume: number;
  totalPnl: number;
  winRate: number;
  strategiesRun: string[];
  firstSeen: string;
  lastSeen: string;
  heartbeatsReceived: number;
}

export interface PlatformStats {
  totalBots: number;
  activeBots: number;
  totalVolume: number;
  totalTrades: number;
  activeStrategies: number;
  connectorHealth: Record<string, boolean>;
}

/* ── Strategy catalog ─────────────────────────────────────────── */

export interface StrategyDef {
  id: string;
  name: string;
  description: string;
  color: string;
  skillFile: string;
}

export const STRATEGIES: StrategyDef[] = [
  {
    id: 'delta-neutral',
    name: 'Delta-Neutral Arb',
    description: 'Cross-platform arbitrage by buying YES on one platform and NO on another when prices diverge.',
    color: '#67e8f9',
    skillFile: 'strategy-delta-neutral.md',
  },
  {
    id: 'thesis',
    name: 'Thesis-Driven',
    description: 'Form a directional view on an outcome and trade when model probability diverges from market price.',
    color: '#F0B90B',
    skillFile: 'strategy-thesis.md',
  },
  {
    id: 'yield',
    name: 'Yield Optimization',
    description: 'Deploy idle capital to Venus Protocol for yield while waiting for trading opportunities.',
    color: '#4ade80',
    skillFile: 'strategy-yield.md',
  },
];

/* ── Skill file catalog ───────────────────────────────────────── */

export const SKILL_FILES = [
  { name: 'skill.md', label: 'Main Router', description: 'Entry point — intent routing + auth walkthrough' },
  { name: 'skill.json', label: 'Package', description: 'Machine-readable skill metadata' },
  { name: 'heartbeat.md', label: 'Heartbeat', description: 'Autonomous 30-min agent loop' },
  { name: 'strategy-playbook.md', label: 'Strategy Playbook', description: 'Master strategy guide' },
  { name: 'strategy-delta-neutral.md', label: 'Delta-Neutral', description: 'Arb strategy playbook' },
  { name: 'strategy-thesis.md', label: 'Thesis-Driven', description: 'Thesis trading playbook' },
  { name: 'strategy-yield.md', label: 'Yield', description: 'Yield optimization playbook' },
  { name: 'skill-market-intel.md', label: 'Market Intel', description: 'Market data + analysis endpoints' },
  { name: 'skill-trading.md', label: 'Trading', description: 'Quote → execute trade flow' },
  { name: 'skill-portfolio.md', label: 'Portfolio', description: 'Positions + yield management' },
  { name: 'skill-identity.md', label: 'Identity', description: 'ERC-8004 on-chain identity' },
  { name: 'messaging.md', label: 'Messaging', description: 'Intent-to-endpoint mapping' },
  { name: 'rules.md', label: 'Rules', description: 'Mandatory constraints + autonomous mode' },
];

/* ── Status colors ────────────────────────────────────────────── */

export const STATUS_COLORS: Record<AgentStatus, string> = {
  active: '#4ade80',
  idle: '#F0B90B',
  stale: '#f87171',
};
