import { mkdir, readFile, appendFile } from "node:fs/promises";
import path from "node:path";
import type {
  MarketConnector,
  Order,
  Platform,
  Position,
  TradeResult,
} from "../types/index.js";

const DEFAULT_LEDGER_PATH = path.join(process.cwd(), ".flash", "trade-fills.jsonl");
const MAX_LEDGER_ROWS = Number(process.env.FLASH_LEDGER_MAX_ROWS || 10_000);

export interface TradeFillRecord {
  recordType: "trade_fill_v1";
  orderId: string;
  platform: Platform;
  marketId: string;
  marketTitle: string;
  outcomeLabel: string;
  side: "buy" | "sell";
  filledSize: number;
  filledPrice: number;
  status: TradeResult["status"];
  timestamp: string;
  txHash?: string;
  source: "agent_action" | "gateway";
  agentId?: string;
}

let appendQueue: Promise<void> = Promise.resolve();

function ledgerPath(): string {
  const configured = process.env.FLASH_POSITION_LEDGER_PATH || process.env.FLASH_LEDGER_PATH;
  return configured && configured.trim().length > 0 ? configured : DEFAULT_LEDGER_PATH;
}

function finitePositive(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function ensureLedgerFile(): Promise<void> {
  const file = ledgerPath();
  await mkdir(path.dirname(file), { recursive: true });
}

function parseRecordLine(line: string): TradeFillRecord | null {
  try {
    const parsed = JSON.parse(line) as TradeFillRecord;
    if (parsed?.recordType !== "trade_fill_v1") return null;
    if (!parsed.orderId || !parsed.marketId || !parsed.platform) return null;
    if (!Number.isFinite(parsed.filledSize) || !Number.isFinite(parsed.filledPrice)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function makePositionKey(platform: Platform, marketId: string, outcomeLabel: string): string {
  return `${platform}|${marketId}|${outcomeLabel.toUpperCase()}`;
}

export async function recordTradeFill(record: TradeFillRecord): Promise<void> {
  if (record.filledSize <= 0) return;

  appendQueue = appendQueue.then(async () => {
    await ensureLedgerFile();
    const file = ledgerPath();
    const payload = JSON.stringify(record);
    await appendFile(file, `${payload}\n`, "utf8");
  });

  return appendQueue;
}

export async function recordTradeResult(params: {
  order: Order;
  trade: TradeResult;
  marketTitle: string;
  outcomeLabel: string;
  source: "agent_action" | "gateway";
  agentId?: string;
}): Promise<void> {
  if (params.trade.filledSize <= 0) return;
  await recordTradeFill({
    recordType: "trade_fill_v1",
    orderId: params.trade.orderId,
    platform: params.order.platform,
    marketId: params.order.marketId,
    marketTitle: params.marketTitle,
    outcomeLabel: params.outcomeLabel,
    side: params.order.side,
    filledSize: finitePositive(params.trade.filledSize),
    filledPrice: finitePositive(params.trade.filledPrice),
    status: params.trade.status,
    timestamp: params.trade.timestamp || new Date().toISOString(),
    txHash: params.trade.txHash,
    source: params.source,
    agentId: params.agentId,
  });
}

export async function readTradeFills(limit = MAX_LEDGER_ROWS, agentId?: string): Promise<TradeFillRecord[]> {
  try {
    const raw = await readFile(ledgerPath(), "utf8");
    const lines = raw.split("\n").filter(Boolean);
    const selected = lines.length > limit ? lines.slice(lines.length - limit) : lines;
    let records = selected
      .map(parseRecordLine)
      .filter((r): r is TradeFillRecord => r !== null);
    if (agentId) {
      records = records.filter((r) => r.agentId === agentId);
    }
    return records.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  } catch {
    return [];
  }
}

export function buildPositionsFromFills(fills: TradeFillRecord[]): Position[] {
  const aggregates = new Map<
    string,
    {
      platform: Platform;
      marketId: string;
      marketTitle: string;
      outcomeLabel: string;
      shares: number;
      costBasis: number;
      lastTimestamp: string;
    }
  >();

  for (const fill of fills) {
    const key = makePositionKey(fill.platform, fill.marketId, fill.outcomeLabel);
    const current = aggregates.get(key) || {
      platform: fill.platform,
      marketId: fill.marketId,
      marketTitle: fill.marketTitle,
      outcomeLabel: fill.outcomeLabel.toUpperCase(),
      shares: 0,
      costBasis: 0,
      lastTimestamp: fill.timestamp,
    };

    if (fill.side === "buy") {
      current.shares += fill.filledSize;
      current.costBasis += fill.filledSize * fill.filledPrice;
    } else {
      const reducible = Math.min(current.shares, fill.filledSize);
      const avg = current.shares > 0 ? current.costBasis / current.shares : 0;
      current.shares -= reducible;
      current.costBasis -= reducible * avg;
      if (current.shares <= 0) {
        current.shares = 0;
        current.costBasis = 0;
      }
    }

    current.lastTimestamp = fill.timestamp;
    current.marketTitle = fill.marketTitle || current.marketTitle;
    aggregates.set(key, current);
  }

  const out: Position[] = [];
  for (const value of aggregates.values()) {
    if (value.shares <= 0) continue;
    const avgEntryPrice = value.costBasis / value.shares;
    out.push({
      platform: value.platform,
      marketId: value.marketId,
      marketTitle: value.marketTitle || value.marketId,
      outcomeLabel: value.outcomeLabel,
      size: value.shares,
      avgEntryPrice,
      currentPrice: avgEntryPrice,
      pnl: 0,
      pnlPercent: 0,
      resolutionDate: "",
    });
  }

  return out.sort((a, b) => a.marketTitle.localeCompare(b.marketTitle));
}

export async function getLedgerPositions(agentId?: string): Promise<Position[]> {
  const fills = await readTradeFills(MAX_LEDGER_ROWS, agentId);
  return buildPositionsFromFills(fills);
}

export async function refreshLivePrices(
  positions: Position[],
  services: Record<string, MarketConnector>,
): Promise<Position[]> {
  const refreshed = await Promise.all(
    positions.map(async (position) => {
      const svc = services[position.platform];
      if (!svc) return position;
      try {
        const prices = await svc.getMarketPrice(position.marketId);
        const livePrice = /^yes$/i.test(position.outcomeLabel) ? prices.yes : prices.no;
        const pnl = (livePrice - position.avgEntryPrice) * position.size;
        const pnlPercent =
          position.avgEntryPrice > 0 ? ((livePrice - position.avgEntryPrice) / position.avgEntryPrice) * 100 : 0;
        return {
          ...position,
          currentPrice: livePrice,
          pnl,
          pnlPercent,
        };
      } catch {
        return position;
      }
    })
  );

  return refreshed;
}
