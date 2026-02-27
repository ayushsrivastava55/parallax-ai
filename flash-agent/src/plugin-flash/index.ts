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
import { getAgentIdentityAction } from './actions/getAgentIdentity.ts';

// Providers
import { marketDataProvider } from './providers/marketData.ts';
import { portfolioProvider } from './providers/portfolio.ts';

// Services
import { PredictFunService } from './services/predictfun.ts';
import { OpinionService } from './services/opinion.ts';
import { ArbEngine } from './services/arbEngine.ts';
import { getBundles } from './services/bundleStore.ts';
import { YieldRouter } from './services/yieldRouter.ts';
import { ERC8004Service, buildERC8004Config } from './services/erc8004.ts';

const flashPlugin: Plugin = {
  name: 'flash',
  description:
    'BNB Chain prediction market trading agent — cross-platform analysis, arbitrage detection, and human-in-the-loop trade execution across Opinion.trade and Predict.fun.',

  async init(_config: Record<string, string>) {
    logger.info('═══ Flash Plugin Initialized ═══');
    logger.info('Platforms: Opinion.trade + Predict.fun (BNB Chain)');
    logger.info('Actions: ANALYZE_MARKET, GET_MARKETS, EXECUTE_TRADE, SCAN_ARBITRAGE, GET_POSITIONS, GET_AGENT_IDENTITY');

    // ERC-8004 agent identity registration (fire-and-forget)
    try {
      const erc8004Config = buildERC8004Config();
      if (erc8004Config) {
        const erc8004 = new ERC8004Service(erc8004Config);
        const agentId = await erc8004.ensureRegistered();
        logger.info({ agentId }, 'ERC-8004 agent identity confirmed');
      } else {
        logger.info('ERC-8004 disabled or not configured — skipping on-chain identity');
      }
    } catch (err) {
      logger.warn({ err }, 'ERC-8004 registration failed (non-critical)');
    }
  },

  actions: [
    analyzeMarketAction,
    getMarketsAction,
    executeTradeAction,
    executeArbBundleAction,
    scanArbitrageAction,
    manageYieldAction,
    getPositionsAction,
    getAgentIdentityAction,
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
    {
      type: 'GET',
      path: '/api/flash/agent-identity',
      handler: async (_req, res, runtime) => {
        try {
          const erc8004Config = buildERC8004Config(runtime);
          if (!erc8004Config) {
            res.json({
              success: false,
              error: 'ERC-8004 not configured',
              data: null,
              timestamp: new Date().toISOString(),
            });
            return;
          }

          const service = new ERC8004Service(erc8004Config);
          const [identity, reputation, flashStats] = await Promise.all([
            service.getAgentIdentity().catch(() => null),
            service.getReputationSummary().catch(() => null),
            service.getFlashAgentStats().catch(() => null),
          ]);

          res.json({
            success: true,
            data: { identity, reputation, flashStats },
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          logger.error({ error }, 'Agent identity route error');
          res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: null,
          });
        }
      },
    },
  ],
};

export default flashPlugin;
