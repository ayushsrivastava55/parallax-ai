import type { Plugin } from '@elizaos/core';
import { logger } from '@elizaos/core';

// Actions
import { getMarketsAction } from './actions/getMarkets.ts';
import { analyzeMarketAction } from './actions/analyzeMarket.ts';
import { executeTradeAction } from './actions/executeTrade.ts';
import { scanArbitrageAction } from './actions/scanArbitrage.ts';
import { getPositionsAction } from './actions/getPositions.ts';

// Providers
import { marketDataProvider } from './providers/marketData.ts';
import { portfolioProvider } from './providers/portfolio.ts';

const flashPlugin: Plugin = {
  name: 'flash',
  description:
    'BNB Chain prediction market trading agent — cross-platform analysis, arbitrage detection, and human-in-the-loop trade execution across Opinion.trade and Predict.fun.',

  async init(_config: Record<string, string>) {
    logger.info('═══ Flash Plugin Initialized ═══');
    logger.info('Platforms: Opinion.trade + Predict.fun (BNB Chain)');
    logger.info('Actions: ANALYZE_MARKET, GET_MARKETS, EXECUTE_TRADE, SCAN_ARBITRAGE, GET_POSITIONS');
  },

  actions: [
    analyzeMarketAction,
    getMarketsAction,
    executeTradeAction,
    scanArbitrageAction,
    getPositionsAction,
  ],

  providers: [
    marketDataProvider,
    portfolioProvider,
  ],
};

export default flashPlugin;
