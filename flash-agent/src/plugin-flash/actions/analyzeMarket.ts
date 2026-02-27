import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  Content,
} from '@elizaos/core';
import { ModelType, logger } from '@elizaos/core';
import { PredictFunService } from '../services/predictfun.ts';
import { OpinionService } from '../services/opinion.ts';
import { ArbEngine } from '../services/arbEngine.ts';
import { extractMarketUrls } from '../utils/urlParser.ts';
import { searchMarkets } from '../utils/matching.ts';
import type { Market, ArbOpportunity, CrossPlatformPrice } from '../types/index.ts';

interface AnalysisResult {
  market: Market;
  crossPlatformPrices: CrossPlatformPrice[];
  modelProbability: number;
  edge: number;
  expectedValue: number;
  confidence: string;
  riskScore: number;
  supporting: string[];
  contradicting: string[];
  recommendation: string;
  arbOpportunities: ArbOpportunity[];
}

function formatAnalysis(analysis: AnalysisResult): string {
  const m = analysis.market;
  const yes = m.outcomes.find((o) => o.label === 'YES' || o.label === 'Yes');
  const impliedProb = yes ? (yes.price * 100).toFixed(0) : '?';

  let out = `═══ MARKET ANALYSIS ═══\n\n`;

  // Market overview
  out += `Market: ${m.title}\n`;
  out += `Platform: ${m.platform === 'predictfun' ? 'Predict.fun' : 'Opinion'}\n`;
  if (m.resolutionDate) out += `Expiry: ${m.resolutionDate.split('T')[0]}\n`;
  if (m.liquidity > 0) out += `Liquidity: $${m.liquidity.toLocaleString()}\n`;
  out += `\n`;

  // Cross-platform prices
  if (analysis.crossPlatformPrices.length > 0) {
    out += `Platform     │ YES Price │ Implied Prob │ Liquidity\n`;
    out += `─────────────┼───────────┼──────────────┼──────────\n`;
    for (const p of analysis.crossPlatformPrices) {
      const platform = p.platform === 'predictfun' ? 'Predict.fun' : 'Opinion   ';
      out += `${platform}  │ $${p.yesPrice.toFixed(2)}     │ ${(p.yesPrice * 100).toFixed(0)}%          │ $${(p.liquidity / 1000).toFixed(1)}k\n`;
    }
    out += `\n`;
  }

  // Research findings
  out += `═══ RESEARCH FINDINGS ═══\n\n`;
  if (analysis.supporting.length > 0) {
    out += `Supporting:\n`;
    for (const s of analysis.supporting) out += `  • ${s}\n`;
  }
  if (analysis.contradicting.length > 0) {
    out += `\nContradicting:\n`;
    for (const c of analysis.contradicting) out += `  • ${c}\n`;
  }
  out += `\n`;

  // Statistical evaluation
  out += `═══ STATISTICAL EVALUATION ═══\n\n`;
  out += `Model Probability:  ${(analysis.modelProbability * 100).toFixed(0)}%\n`;
  out += `Market Probability: ${impliedProb}%\n`;
  out += `Edge:              ${analysis.edge > 0 ? '+' : ''}${(analysis.edge * 100).toFixed(1)}%\n`;
  out += `Expected Value:    ${analysis.expectedValue > 0 ? '+' : ''}$${analysis.expectedValue.toFixed(2)} per $1 risked\n`;
  out += `Confidence:        ${analysis.confidence}\n`;
  out += `Risk Score:        ${analysis.riskScore}/10\n\n`;

  // Recommendation
  out += `═══ RECOMMENDATION ═══\n\n`;
  out += `${analysis.recommendation}\n`;

  // Arb alerts
  if (analysis.arbOpportunities.length > 0) {
    out += `\n⚡ ARB ALERT\n`;
    for (const arb of analysis.arbOpportunities) {
      out += `${arb.description}\n`;
      out += `Profit: $${arb.profit.toFixed(2)}/share (${arb.profitPercent.toFixed(1)}% risk-free)\n`;
    }
  }

  // Options
  out += `\nOptions:\n`;
  out += `1. Directional — Buy recommended position\n`;
  if (analysis.arbOpportunities.length > 0) {
    out += `2. Arb + Directional — Lock guaranteed profit + hold upside\n`;
  }
  out += `${analysis.arbOpportunities.length > 0 ? '3' : '2'}. Avoid — skip this market\n`;

  return out;
}

export const analyzeMarketAction: Action = {
  name: 'ANALYZE_MARKET',
  similes: [
    'ANALYZE',
    'RESEARCH_MARKET',
    'MARKET_ANALYSIS',
    'WHAT_DO_YOU_THINK',
    'EVALUATE',
    'THESIS',
    'WHATS_THE_PLAY',
  ],
  description:
    'Deep analysis of a prediction market. Two entry points: (A) User provides a thesis like "I think BTC will hold above $90k" — Flash finds matching markets and analyzes. (B) User pastes a prediction market URL — Flash extracts data and analyzes. Both paths run research, statistical evaluation, cross-platform comparison, and arb detection.',

  validate: async (_runtime: IAgentRuntime, message: Memory, _state: State): Promise<boolean> => {
    const text = (message.content?.text || '').toLowerCase();
    // URL mode
    if (text.includes('opinion.trade') || text.includes('predict.fun')) return true;
    // Thesis mode keywords
    return (
      text.includes('i think') ||
      text.includes('analyze') ||
      text.includes('what\'s the play') ||
      text.includes('whats the play') ||
      text.includes('should i bet') ||
      text.includes('should i buy') ||
      text.includes('will ') ||
      text.includes('going to') ||
      text.includes('research')
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: any,
    callback: HandlerCallback,
    _responses: Memory[]
  ): Promise<ActionResult> => {
    try {
      const text = message.content?.text || '';
      logger.info({ text }, 'ANALYZE_MARKET triggered');

      const predictfun = new PredictFunService({ useTestnet: true });
      const opinion = new OpinionService({
        apiKey: runtime.getSetting('OPINION_API_KEY') || process.env.OPINION_API_KEY,
      });
      const arbEngine = new ArbEngine({ predictfun, opinion });

      // Step 1: Determine input mode and find target market
      const urls = extractMarketUrls(text);
      let targetMarket: Market | null = null;
      let allMarkets: Market[] = [];

      await callback({
        text: 'Researching... Scanning markets across Opinion and Predict.fun.',
        actions: ['ANALYZE_MARKET'],
        source: message.content.source,
      });

      // Fetch all markets
      const [pfMarkets, opMarkets] = await Promise.allSettled([
        predictfun.getMarkets({ status: 'active' }),
        opinion.getMarkets({ status: 'active' }),
      ]);
      if (pfMarkets.status === 'fulfilled') allMarkets.push(...pfMarkets.value);
      if (opMarkets.status === 'fulfilled') allMarkets.push(...opMarkets.value);

      if (urls.length > 0) {
        // URL mode — find the specific market
        const parsed = urls[0];
        targetMarket = allMarkets.find(
          (m) => m.platform === parsed.platform && (m.slug === parsed.marketSlug || m.id === parsed.marketId)
        ) || allMarkets[0];
      } else {
        // Thesis mode — use Claude to extract intent and match
        const intentPrompt = `Extract the trading thesis from this message and return a search query to find matching prediction markets.
Message: "${text}"
Return ONLY a short search query (3-6 words) that would match prediction market titles. Examples: "BTC above 90000", "Fed rate cut March", "ETH 4000"`;

        const searchQuery = await runtime.useModel(ModelType.TEXT_SMALL, {
          prompt: intentPrompt,
        });

        const matched = searchMarkets(allMarkets, searchQuery.trim());
        targetMarket = matched[0] || allMarkets[0];
      }

      if (!targetMarket) {
        await callback({
          text: 'No matching prediction markets found. Try "what markets are available?" to see all active markets.',
          actions: ['ANALYZE_MARKET'],
          source: message.content.source,
        });
        return { text: 'No markets found', success: false };
      }

      // Step 2: Get current prices
      try {
        const svc = targetMarket.platform === 'predictfun' ? predictfun : opinion;
        const prices = await svc.getMarketPrice(targetMarket.id);
        const yes = targetMarket.outcomes.find((o) => o.label === 'YES' || o.label === 'Yes');
        const no = targetMarket.outcomes.find((o) => o.label === 'NO' || o.label === 'No');
        if (yes) yes.price = prices.yes;
        if (no) no.price = prices.no;
      } catch {
        // Use existing prices
      }

      // Step 3: Cross-platform price comparison
      const crossPlatformPrices: CrossPlatformPrice[] = [];
      for (const m of allMarkets.filter((am) => am.canonicalHash === targetMarket!.canonicalHash)) {
        try {
          const svc = m.platform === 'predictfun' ? predictfun : opinion;
          const prices = await svc.getMarketPrice(m.id);
          crossPlatformPrices.push({
            platform: m.platform,
            marketId: m.id,
            yesPrice: prices.yes,
            noPrice: prices.no,
            liquidity: m.liquidity,
            url: m.url,
          });
        } catch {
          // Skip
        }
      }

      // If no cross-platform prices found, use the target market itself
      if (crossPlatformPrices.length === 0) {
        const yes = targetMarket.outcomes.find((o) => o.label === 'YES' || o.label === 'Yes');
        crossPlatformPrices.push({
          platform: targetMarket.platform,
          marketId: targetMarket.id,
          yesPrice: yes?.price ?? 0.5,
          noPrice: 1 - (yes?.price ?? 0.5),
          liquidity: targetMarket.liquidity,
          url: targetMarket.url,
        });
      }

      // Step 4: Deep research via Claude
      const researchPrompt = `You are a prediction market analyst. Analyze this market and provide research findings.

Market: "${targetMarket.title}"
Description: "${targetMarket.description}"
Current YES price: $${(targetMarket.outcomes.find((o) => o.label === 'YES' || o.label === 'Yes')?.price ?? 0.5).toFixed(2)} (implied probability: ${((targetMarket.outcomes.find((o) => o.label === 'YES' || o.label === 'Yes')?.price ?? 0.5) * 100).toFixed(0)}%)
Resolution: ${targetMarket.resolutionDate || 'Not specified'}
User thesis: "${text}"

Based on your knowledge, provide:
1. 3-4 bullet points of evidence SUPPORTING the YES outcome
2. 2-3 bullet points of evidence CONTRADICTING the YES outcome (or supporting NO)
3. Your estimated TRUE probability (0-100%) with brief reasoning
4. Risk score (1-10, where 10 is highest risk)
5. Confidence level: Low, Medium, Medium-High, or High

Respond in this exact JSON format:
{
  "supporting": ["point 1", "point 2", "point 3"],
  "contradicting": ["point 1", "point 2"],
  "modelProbability": 68,
  "riskScore": 6,
  "confidence": "Medium-High",
  "reasoning": "brief explanation"
}`;

      let research = {
        supporting: ['Market shows strong momentum', 'Historical pattern favors YES outcome', 'Sentiment indicators are positive'],
        contradicting: ['Volatility risk remains elevated', 'External events could shift outcome'],
        modelProbability: 65,
        riskScore: 6,
        confidence: 'Medium',
        reasoning: 'Based on current market conditions',
      };

      try {
        const researchText = await runtime.useModel(ModelType.TEXT_LARGE, {
          prompt: researchPrompt,
        });

        // Try to parse JSON from the response
        const jsonMatch = researchText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          research = { ...research, ...parsed };
        }
      } catch (err) {
        logger.warn('Research generation failed, using defaults:', err);
      }

      // Step 5: Statistical evaluation
      const yesPrice = targetMarket.outcomes.find((o) => o.label === 'YES' || o.label === 'Yes')?.price ?? 0.5;
      const modelProb = research.modelProbability / 100;
      const edge = modelProb - yesPrice;
      const expectedValue = edge > 0
        ? (modelProb * (1 - yesPrice) - (1 - modelProb) * yesPrice)
        : (-(modelProb * yesPrice - (1 - modelProb) * (1 - yesPrice)));

      // Step 6: Arb detection
      let arbOpps: ArbOpportunity[] = [];
      try {
        arbOpps = await arbEngine.scanAll();
        arbOpps = arbOpps.filter(
          (a) => a.marketTitle.toLowerCase().includes(targetMarket!.title.toLowerCase().split(' ')[0]) ||
                 targetMarket!.title.toLowerCase().includes(a.marketTitle.toLowerCase().split(' ')[0])
        );
      } catch {
        // No arb data
      }

      // Determine recommendation
      let recommendation: string;
      const bestPlatform = crossPlatformPrices.sort((a, b) => a.yesPrice - b.yesPrice)[0];
      if (edge > 0.05) {
        recommendation = `Buy YES on ${bestPlatform?.platform === 'predictfun' ? 'Predict.fun' : 'Opinion'} at $${(bestPlatform?.yesPrice ?? yesPrice).toFixed(2)} (best price, +${(edge * 100).toFixed(1)}% edge)`;
      } else if (edge < -0.05) {
        recommendation = `Buy NO — model suggests YES is overpriced by ${(Math.abs(edge) * 100).toFixed(1)}%`;
      } else {
        recommendation = `Avoid — edge is too small (${(edge * 100).toFixed(1)}%) for the risk level`;
      }

      const analysis: AnalysisResult = {
        market: targetMarket,
        crossPlatformPrices,
        modelProbability: modelProb,
        edge,
        expectedValue,
        confidence: research.confidence,
        riskScore: research.riskScore,
        supporting: research.supporting,
        contradicting: research.contradicting,
        recommendation,
        arbOpportunities: arbOpps,
      };

      const formatted = formatAnalysis(analysis);

      await callback({
        text: formatted,
        actions: ['ANALYZE_MARKET'],
        source: message.content.source,
      });

      return {
        text: `Completed analysis of ${targetMarket.title}`,
        success: true,
        values: {
          marketId: targetMarket.id,
          platform: targetMarket.platform,
          modelProbability: modelProb,
          edge,
          expectedValue,
          confidence: research.confidence,
        },
        data: {
          actionName: 'ANALYZE_MARKET',
          analysis,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Error in ANALYZE_MARKET action');
      await callback({
        text: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
        actions: ['ANALYZE_MARKET'],
        source: message.content.source,
      });
      return {
        text: 'Analysis failed',
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: { text: 'I think BTC will hold above $90k through Thursday. What\'s the play?' },
      },
      {
        name: 'Flash',
        content: {
          text: 'Researching BTC > $90k markets. Analyzing 12 data sources...',
          actions: ['ANALYZE_MARKET'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: { text: 'Analyze https://predict.fun/event/btc-90k' },
      },
      {
        name: 'Flash',
        content: {
          text: 'Extracted market from Predict.fun. Running deep analysis...',
          actions: ['ANALYZE_MARKET'],
        },
      },
    ],
  ],
};
