import type { ParsedMarketUrl, Platform } from "../types/index.js";

/**
 * Parse a prediction market URL into platform + slug/ID.
 * Supports Opinion.trade and Predict.fun URLs.
 */
export function parseMarketUrl(url: string): ParsedMarketUrl | null {
  try {
    const parsed = new URL(url);

    // Opinion.trade: https://opinion.trade/markets/{slug}
    // or: https://opinion.trade/event/{slug}
    if (
      parsed.hostname === "opinion.trade" ||
      parsed.hostname === "www.opinion.trade"
    ) {
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      if (pathParts.length >= 2 && (pathParts[0] === "markets" || pathParts[0] === "event")) {
        return {
          platform: "opinion",
          marketSlug: pathParts[1],
          raw: url,
        };
      }
    }

    // Predict.fun: https://predict.fun/event/{slug}
    // or: https://predict.fun/market/{id}
    if (
      parsed.hostname === "predict.fun" ||
      parsed.hostname === "www.predict.fun"
    ) {
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      if (pathParts.length >= 2) {
        return {
          platform: "predictfun",
          marketSlug: pathParts[1],
          marketId: pathParts[1],
          raw: url,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Detect if a message contains a prediction market URL.
 */
export function extractMarketUrls(text: string): ParsedMarketUrl[] {
  const urlRegex = /https?:\/\/(?:www\.)?(?:opinion\.trade|predict\.fun)[^\s)}\]]+/g;
  const matches = text.match(urlRegex) || [];
  return matches
    .map(parseMarketUrl)
    .filter((p): p is ParsedMarketUrl => p !== null);
}
