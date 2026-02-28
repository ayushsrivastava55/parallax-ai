export interface GatewayRouteRequest {
  body?: unknown;
  params?: Record<string, string | undefined>;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
  path?: string;
  url?: string;
}

export interface GatewaySuccess<T> {
  success: true;
  requestId: string;
  data: T;
  error: null;
  timestamp: string;
}

export interface GatewayFailure {
  success: false;
  requestId: string;
  data: null;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
}

export type GatewayResponse<T> = GatewaySuccess<T> | GatewayFailure;

export interface GatewayAuthContext {
  agentId: string;
  keyId: string;
}

/* ── Bot Registry ─────────────────────────────────────────────── */

export type BotStatus = 'active' | 'idle' | 'stale';

export interface BotRecord {
  agentId: string;
  keyId: string;
  registeredAt: string;
  lastSeenAt: string;
  lastHeartbeatAt: string | null;
  totalRequests: number;
  totalTrades: number;
  totalVolume: number;
  activeStrategies: string[];
  status: BotStatus;
  walletAddress?: string;
  encryptedPrivateKey?: string;
  onChainVerified?: boolean;
  erc8004AgentId?: number;
  nfaTokenId?: number;
}

export interface ActivityEvent {
  id: string;
  agentId: string;
  type: string;
  timestamp: string;
  details: Record<string, unknown>;
}

export interface BotStats {
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

/* ── Quote tokens ─────────────────────────────────────────────── */

export interface QuoteTokenPayload {
  tokenVersion: 1;
  agentId: string;
  marketId: string;
  marketTitle?: string;
  platform: 'predictfun' | 'opinion' | 'probable' | 'xmarket';
  side: 'YES' | 'NO';
  shares: number;
  quotedPrice: number;
  quotedCost: number;
  maxSlippageBps: number;
  expiresAt: number;
}
