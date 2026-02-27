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

export interface QuoteTokenPayload {
  tokenVersion: 1;
  agentId: string;
  marketId: string;
  marketTitle?: string;
  platform: 'predictfun' | 'opinion';
  side: 'YES' | 'NO';
  shares: number;
  quotedPrice: number;
  quotedCost: number;
  maxSlippageBps: number;
  expiresAt: number;
}
