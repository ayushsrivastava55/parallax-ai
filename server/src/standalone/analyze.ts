import { Agent, run, tool } from '@openai/agents';
import { OpenAIChatCompletionsModel } from '@openai/agents';
import OpenAI from 'openai';
import { z } from 'zod';
import { PredictFunService } from '../plugin-flash/services/predictfun.ts';
import { OpinionService } from '../plugin-flash/services/opinion.ts';
import { ArbEngine } from '../plugin-flash/services/arbEngine.ts';
import { extractMarketUrls } from '../plugin-flash/utils/urlParser.ts';
import { searchMarkets } from '../plugin-flash/utils/matching.ts';
import type { Market, ArbOpportunity, CrossPlatformPrice } from '../plugin-flash/types/index.ts';

// MiniMax M2.5 via OpenAI-compatible chat completions API
const RESEARCH_MODEL = process.env.OPENAI_LARGE_MODEL || 'MiniMax-M2.5';
const RESEARCH_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.minimax.io/v1';

function getResearchModel(): OpenAIChatCompletionsModel {
  const client = new OpenAI({
    apiKey: process.env.MINIMAX_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: RESEARCH_BASE_URL,
  });
  return new OpenAIChatCompletionsModel(client, RESEARCH_MODEL);
}

/** Web search via Serper Google Search API */
const webSearch = tool({
  name: 'search',
  description: 'Search the web for recent information using Google Search.',
  parameters: z.object({ query: z.string().describe('Search query') }),
  execute: async ({ query }) => {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: 5 }),
    });
    if (!res.ok) throw new Error(`Serper error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const results = (data.organic || []).slice(0, 5).map((r: any) => ({
      title: r.title,
      link: r.link,
      snippet: r.snippet,
    }));
    return JSON.stringify(results);
  },
});

/** Browse a URL via Jina Reader API */
const browse = tool({
  name: 'browse',
  description: 'Read the content of a web page URL and return its text.',
  parameters: z.object({ url: z.string().describe('URL to read') }),
  execute: async ({ url }) => {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        Accept: 'text/plain',
        Authorization: `Bearer ${process.env.JINA_API_KEY || ''}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Jina error ${res.status}: ${await res.text()}`);
    const text = await res.text();
    return text.slice(0, 5000);
  },
});

export interface SearchSource {
  title: string;
  url: string;
  snippet: string;
}

export interface AnalysisResult {
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
  sources: SearchSource[];
  reasoning: string;
}

function makeOpinion(): OpinionService {
  const opinionKey = String(process.env.OPINION_API_KEY || '');
  return new OpinionService({
    enabled: process.env.OPINION_ENABLED === 'true' && !!opinionKey,
    apiKey: opinionKey,
  });
}

function formatAnalysis(analysis: AnalysisResult): string {
  const m = analysis.market;
  const yes = m.outcomes.find((o) => o.label === 'YES' || o.label === 'Yes');
  const impliedProb = yes ? (yes.price * 100).toFixed(0) : '?';

  let out = `MARKET ANALYSIS\n\n`;
  out += `Market: ${m.title}\n`;
  out += `Platform: ${m.platform === 'predictfun' ? 'Predict.fun' : 'Opinion'}\n`;
  if (m.resolutionDate) out += `Expiry: ${m.resolutionDate.split('T')[0]}\n`;
  if (m.liquidity > 0) out += `Liquidity: $${m.liquidity.toLocaleString()}\n`;
  out += `\n`;

  if (analysis.crossPlatformPrices.length > 0) {
    out += `Platform     | YES Price | Implied Prob | Liquidity\n`;
    out += `-------------+-----------+--------------+----------\n`;
    for (const p of analysis.crossPlatformPrices) {
      const platform = p.platform === 'predictfun' ? 'Predict.fun' : 'Opinion   ';
      out += `${platform}  | $${p.yesPrice.toFixed(2)}     | ${(p.yesPrice * 100).toFixed(0)}%          | $${(p.liquidity / 1000).toFixed(1)}k\n`;
    }
    out += `\n`;
  }

  out += `RESEARCH FINDINGS\n\n`;
  if (analysis.supporting.length > 0) {
    out += `Supporting:\n`;
    for (const s of analysis.supporting) out += `  - ${s}\n`;
  }
  if (analysis.contradicting.length > 0) {
    out += `\nContradicting:\n`;
    for (const c of analysis.contradicting) out += `  - ${c}\n`;
  }
  out += `\n`;

  out += `STATISTICAL EVALUATION\n\n`;
  out += `Model Probability:  ${(analysis.modelProbability * 100).toFixed(0)}%\n`;
  out += `Market Probability: ${impliedProb}%\n`;
  out += `Edge:              ${analysis.edge > 0 ? '+' : ''}${(analysis.edge * 100).toFixed(1)}%\n`;
  out += `Expected Value:    ${analysis.expectedValue > 0 ? '+' : ''}$${analysis.expectedValue.toFixed(2)} per $1 risked\n`;
  out += `Confidence:        ${analysis.confidence}\n`;
  out += `Risk Score:        ${analysis.riskScore}/10\n\n`;

  out += `RECOMMENDATION\n\n`;
  out += `${analysis.recommendation}\n`;

  if (analysis.arbOpportunities.length > 0) {
    out += `\nARB ALERT\n`;
    for (const arb of analysis.arbOpportunities) {
      out += `${arb.description}\n`;
      out += `Profit: $${arb.profit.toFixed(2)}/share (${arb.profitPercent.toFixed(1)}% risk-free)\n`;
    }
  }

  if (analysis.sources.length > 0) {
    out += `\nSOURCES (${analysis.sources.length})\n`;
    for (const s of analysis.sources) {
      out += `  - ${s.title}: ${s.url}\n`;
    }
  }

  return out;
}

function parseResearchJson(text: string): any | null {
  // Strategy 1: Direct parse
  try {
    return JSON.parse(text.trim());
  } catch { /* fall through */ }

  // Strategy 2: Extract from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch { /* fall through */ }
  }

  // Strategy 3: Regex extract first {...}
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch { /* fall through */ }
  }

  return null;
}

export async function analyzeWithAgent(query: string, allMarkets: Market[]): Promise<AnalysisResult> {
  const predictfun = new PredictFunService({ useTestnet: true });
  const opinion = makeOpinion();
  const arbEngine = new ArbEngine({ predictfun, opinion });

  // Step 1: Find target market
  const urls = extractMarketUrls(query);
  let targetMarket: Market | null = null;

  if (urls.length > 0) {
    const parsed = urls[0];
    targetMarket =
      allMarkets.find(
        (m) => m.platform === parsed.platform && (m.slug === parsed.marketSlug || m.id === parsed.marketId),
      ) || allMarkets[0];
  } else {
    // Use Agent to extract search query from thesis (MiniMax M2.5)
    const extractAgent = new Agent({
      name: 'thesis-extractor',
      instructions:
        'Extract the trading thesis from the user message and return ONLY a short search query (3-6 words) that would match prediction market titles. Examples: "BTC above 90000", "Fed rate cut March", "ETH 4000". Return ONLY the query, nothing else.',
      model: getResearchModel(),
    });

    const extractResult = await run(extractAgent, query);
    const searchQuery = extractResult.finalOutput.trim();
    const matched = searchMarkets(allMarkets, searchQuery);
    targetMarket = matched[0] || allMarkets[0];
  }

  if (!targetMarket) {
    throw new Error('No matching prediction markets found.');
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

  // Step 4: Deep research via Agent + direct Serper/Jina tools
  const yesPrice = targetMarket.outcomes.find((o) => o.label === 'YES' || o.label === 'Yes')?.price ?? 0.5;

  const researchAgent = new Agent({
    name: 'market-researcher',
    instructions: `You are an expert prediction market research analyst with web search capabilities.

Your job is to research a prediction market and provide an evidence-based assessment.

WORKFLOW:
1. Use the "search" tool to find recent news, data, and expert analysis relevant to the market question. Run at least 2-3 different searches with varied queries.
2. Use the "browse" tool to read the most promising articles for deeper context.
3. Synthesize ALL findings into your final assessment.

IMPORTANT:
- Search for CURRENT information — recent news, statistics, expert opinions, and data.
- Cite specific facts, dates, and numbers from your research in your supporting/contradicting points.
- Each supporting/contradicting point should reference what you actually found, not generic reasoning.
- Include a "sources" array with title + URL for every source you used.

After completing your research, respond with ONLY this JSON:
{
  "supporting": ["evidence point 1 (source: ...)", "evidence point 2 (source: ...)", ...],
  "contradicting": ["evidence point 1 (source: ...)", "evidence point 2 (source: ...)", ...],
  "modelProbability": <0-100>,
  "riskScore": <1-10>,
  "confidence": "Low" | "Medium" | "Medium-High" | "High",
  "reasoning": "brief synthesis of your research",
  "sources": [{"title": "...", "url": "...", "snippet": "key quote or fact"}, ...]
}

Respond with ONLY the JSON object after you have completed all your research. No markdown, no explanation.`,
    model: getResearchModel(),
    tools: [webSearch, browse],
  });

  const researchPrompt = `Research this prediction market and provide your evidence-based assessment.

Market: "${targetMarket.title}"
Description: "${targetMarket.description}"
Current YES price: $${yesPrice.toFixed(2)} (implied probability: ${(yesPrice * 100).toFixed(0)}%)
Resolution: ${targetMarket.resolutionDate || 'Not specified'}
User thesis: "${query}"

Start by searching for recent relevant information, then provide your JSON assessment.`;

  const researchResult = await run(researchAgent, researchPrompt, { maxTurns: 10 });
  const parsed = parseResearchJson(researchResult.finalOutput);

  if (!parsed || !Array.isArray(parsed.supporting) || typeof parsed.modelProbability !== 'number') {
    throw new Error('Research model output invalid/unavailable; analysis aborted.');
  }

  const research = {
    supporting: parsed.supporting as string[],
    contradicting: Array.isArray(parsed.contradicting) ? (parsed.contradicting as string[]) : [],
    modelProbability: parsed.modelProbability as number,
    riskScore: typeof parsed.riskScore === 'number' ? parsed.riskScore : 5,
    confidence: typeof parsed.confidence === 'string' ? parsed.confidence : 'Medium',
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    sources: Array.isArray(parsed.sources)
      ? (parsed.sources as SearchSource[]).map((s) => ({
          title: String(s.title || ''),
          url: String(s.url || ''),
          snippet: String(s.snippet || ''),
        }))
      : [],
  };

  // Step 5: Statistical evaluation
  const modelProb = research.modelProbability / 100;
  const edge = modelProb - yesPrice;
  const expectedValue =
    edge > 0
      ? modelProb * (1 - yesPrice) - (1 - modelProb) * yesPrice
      : -(modelProb * yesPrice - (1 - modelProb) * (1 - yesPrice));

  // Step 6: Arb detection
  let arbOpps: ArbOpportunity[] = [];
  try {
    arbOpps = await arbEngine.scanAll();
    arbOpps = arbOpps.filter(
      (a) =>
        a.marketTitle.toLowerCase().includes(targetMarket!.title.toLowerCase().split(' ')[0]) ||
        targetMarket!.title.toLowerCase().includes(a.marketTitle.toLowerCase().split(' ')[0]),
    );
  } catch {
    // No arb data
  }

  // Recommendation
  let recommendation: string;
  const bestPlatform = crossPlatformPrices.sort((a, b) => a.yesPrice - b.yesPrice)[0];
  if (edge > 0.05) {
    recommendation = `Buy YES on ${bestPlatform?.platform === 'predictfun' ? 'Predict.fun' : 'Opinion'} at $${(bestPlatform?.yesPrice ?? yesPrice).toFixed(2)} (best price, +${(edge * 100).toFixed(1)}% edge)`;
  } else if (edge < -0.05) {
    recommendation = `Buy NO — model suggests YES is overpriced by ${(Math.abs(edge) * 100).toFixed(1)}%`;
  } else {
    recommendation = `Avoid — edge is too small (${(edge * 100).toFixed(1)}%) for the risk level`;
  }

  return {
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
    sources: research.sources,
    reasoning: research.reasoning,
  };
}

export { formatAnalysis };
