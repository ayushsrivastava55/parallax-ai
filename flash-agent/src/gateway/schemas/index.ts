import { z } from 'zod';

const platformSchema = z.enum(['predictfun', 'opinion']);

export const listMarketsSchema = z.object({
  platforms: z.array(platformSchema).optional(),
  status: z.enum(['active', 'all']).default('active'),
  limit: z.number().int().positive().max(100).default(20),
});

export const analyzeMarketSchema = z.object({
  query: z.string().min(3),
  marketId: z.string().optional(),
  platform: platformSchema.optional(),
});

export const tradeQuoteSchema = z.object({
  marketId: z.string().min(1),
  platform: platformSchema,
  side: z.enum(['YES', 'NO']),
  size: z.number().positive(),
  sizeType: z.enum(['shares', 'usd']),
  maxSlippageBps: z.number().int().nonnegative().max(5000).default(100),
});

export const tradeExecuteSchema = z.object({
  confirmationToken: z.string().min(10),
  clientOrderId: z.string().min(4),
});

export const positionsListSchema = z.object({
  wallet: z.string().optional(),
  includeVirtual: z.boolean().default(true),
});

export const arbScanSchema = z.object({
  maxCapitalUsd: z.number().positive().optional(),
  platforms: z.array(platformSchema).optional(),
});

export const yieldManageSchema = z.object({
  mode: z.enum(['status', 'deploy', 'recall']),
  amountUsd: z.number().nonnegative().optional(),
  idleUsd: z.number().nonnegative().optional(),
  openTradeDemandUsd: z.number().nonnegative().optional(),
});

/* ── Bot schemas ──────────────────────────────────────────────── */

export const botsListSchema = z.object({
  status: z.enum(['active', 'idle', 'stale', 'all']).default('all'),
});

export const botActivitySchema = z.object({
  limit: z.number().int().positive().max(200).default(50),
});

export const botHeartbeatSchema = z.object({
  strategies: z.array(z.string()).optional(),
  state: z.record(z.string(), z.unknown()).optional(),
});

/* ── Inferred types ───────────────────────────────────────────── */

export type BotsListInput = z.infer<typeof botsListSchema>;
export type BotActivityInput = z.infer<typeof botActivitySchema>;
export type BotHeartbeatInput = z.infer<typeof botHeartbeatSchema>;
export type ListMarketsInput = z.infer<typeof listMarketsSchema>;
export type AnalyzeMarketInput = z.infer<typeof analyzeMarketSchema>;
export type TradeQuoteInput = z.infer<typeof tradeQuoteSchema>;
export type TradeExecuteInput = z.infer<typeof tradeExecuteSchema>;
export type PositionsListInput = z.infer<typeof positionsListSchema>;
export type ArbScanInput = z.infer<typeof arbScanSchema>;
export type YieldManageInput = z.infer<typeof yieldManageSchema>;
