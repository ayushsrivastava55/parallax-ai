import { createHash } from "crypto";
import type { Market } from "../types/index.js";

/**
 * Generate a canonical hash for cross-platform event matching.
 * Normalizes description + resolution date to find the same event on different platforms.
 */
export function canonicalHash(description: string, resolutionDate: string): string {
  const normalized = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const dateNormalized = resolutionDate.split("T")[0]; // YYYY-MM-DD only

  const input = `${normalized}|${dateNormalized}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/**
 * Find matching markets across platforms by canonical hash.
 */
export function findMatchingMarkets(
  markets: Market[],
  targetHash: string
): Market[] {
  return markets.filter((m) => m.canonicalHash === targetHash);
}

/**
 * Fuzzy match markets by keyword search in title/description.
 */
export function searchMarkets(markets: Market[], query: string): Market[] {
  const terms = query.toLowerCase().split(/\s+/);
  return markets
    .filter((m) => {
      const text = `${m.title} ${m.description}`.toLowerCase();
      return terms.every((t) => text.includes(t));
    })
    .sort((a, b) => b.liquidity - a.liquidity);
}
