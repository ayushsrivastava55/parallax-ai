import type { Plugin } from '@elizaos/core';
import { logger } from '@elizaos/core';

// Actions
import { getMarketsAction } from './actions/getMarkets.ts';
import { analyzeMarketAction } from './actions/analyzeMarket.ts';
import { executeTradeAction } from './actions/executeTrade.ts';
import { scanArbitrageAction } from './actions/scanArbitrage.ts';
import { getPositionsAction } from './actions/getPositions.ts';
import { executeArbBundleAction } from './actions/executeArbBundle.ts';
import { manageYieldAction } from './actions/manageYield.ts';

// Providers
import { marketDataProvider } from './providers/marketData.ts';
import { portfolioProvider } from './providers/portfolio.ts';

// Services
import { PredictFunService } from './services/predictfun.ts';
import { OpinionService } from './services/opinion.ts';
import { ArbEngine } from './services/arbEngine.ts';
import { getBundles } from './services/bundleStore.ts';
import { YieldRouter } from './services/yieldRouter.ts';

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
    executeArbBundleAction,
    scanArbitrageAction,
    manageYieldAction,
    getPositionsAction,
  ],

  providers: [
    marketDataProvider,
    portfolioProvider,
  ],

  routes: [
    {
      type: 'GET',
      path: '/api/flash/arb-scan',
      handler: async (_req, res, runtime) => {
        try {
          const predictfun = new PredictFunService({ useTestnet: true });
          const opinionKey = String(runtime.getSetting('OPINION_API_KEY') || process.env.OPINION_API_KEY || '');
          const opinion = new OpinionService({
            enabled: (process.env.OPINION_ENABLED === 'true') && !!opinionKey,
            apiKey: opinionKey,
          });
          const arbEngine = new ArbEngine({ predictfun, opinion });

          const opportunities = await arbEngine.scanAll();
          res.json({
            success: true,
            data: opportunities,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          logger.error({ error }, 'Arb scan route error');
          res.status(500).json({
            success: false,
            data: [],
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      },
    },
    {
      type: 'GET',
      path: '/api/flash/bundles',
      handler: async (req, res) => {
        const limit = Number(req.query?.limit || 25);
        res.json({
          success: true,
          data: getBundles(limit),
          timestamp: new Date().toISOString(),
        });
      },
    },
    {
      type: 'GET',
      path: '/api/flash/yield-status',
      handler: async (req, res, runtime) => {
        const router = new YieldRouter({
          minIdleUsd: Number(runtime.getSetting('YIELD_MIN_IDLE_USD') || process.env.YIELD_MIN_IDLE_USD || 500),
          recallBufferUsd: Number(runtime.getSetting('YIELD_RECALL_BUFFER_USD') || process.env.YIELD_RECALL_BUFFER_USD || 200),
          maxUtilizationPct: Number(runtime.getSetting('YIELD_MAX_UTILIZATION_PCT') || process.env.YIELD_MAX_UTILIZATION_PCT || 80),
        });
        res.json({
          success: true,
          data: router.getStatus(),
          timestamp: new Date().toISOString(),
        });
      },
    },
  ],
};

export default flashPlugin;
