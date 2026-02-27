import type {
  Provider,
  ProviderResult,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import { logger } from '@elizaos/core';

export const marketDataProvider: Provider = {
  name: 'MARKET_DATA_PROVIDER',
  description:
    'Tells the agent which prediction market tools are available.',

  get: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State
  ): Promise<ProviderResult> => {
    const summary = `[Flash Agent Capabilities]
You have access to live BNB Chain prediction market data via these actions:
- GET_MARKETS: Fetches and displays active markets with real prices from Predict.fun and Opinion.trade. USE THIS when the user asks about available markets, market count, or wants to browse.
- ANALYZE_MARKET: Deep research + statistical analysis of a specific market or thesis. USE THIS when the user has a trading thesis or asks for analysis.
- SCAN_ARBITRAGE: Scans for cross-platform arbitrage opportunities. USE THIS when the user asks about arb, guaranteed profit, or mispricings.
- EXECUTE_TRADE: Places a trade after explicit user approval. USE THIS when the user says "execute", "buy", "option 1", etc.
- EXECUTE_ARB_BUNDLE: Plans and executes a 2-leg delta-neutral bundle with unwind fallback. USE THIS when user asks to "execute arb" or "run delta-neutral bundle".
- MANAGE_YIELD: Routes idle capital into Venus and recalls for trade demand. USE THIS when user asks about yield rotation, idle capital, or Venus status.
- GET_POSITIONS: Shows portfolio and P&L. USE THIS when the user asks about positions, portfolio, or P&L.

IMPORTANT: When a user asks about markets, prices, or predictions, ALWAYS use the appropriate action above instead of answering from memory. You must call the action to get live data.`;

    return { text: summary, values: {}, data: {} };
  },
};
