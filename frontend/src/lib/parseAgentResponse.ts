export type BlockType =
  | 'market_table'
  | 'research'
  | 'edge'
  | 'recommendation'
  | 'arb_scan'
  | 'arb_alert'
  | 'trade_confirm'
  | 'text';

export interface ParsedBlock {
  type: BlockType;
  title: string;
  raw: string;
}

const SECTION_MAP: Record<string, BlockType> = {
  'MARKET ANALYSIS': 'market_table',
  'ACTIVE PREDICTION MARKETS': 'market_table',
  'RESEARCH FINDINGS': 'research',
  'STATISTICAL EVALUATION': 'edge',
  'RECOMMENDATION': 'recommendation',
  'ARBITRAGE SCAN': 'arb_scan',
};

const SECTION_RE = /(═{3,}\s+(.+?)\s+═{3,})/;

export function parseAgentResponse(text: string): ParsedBlock[] {
  if (!text || !text.trim()) return [];

  const blocks: ParsedBlock[] = [];
  const parts = text.split(SECTION_RE);

  // parts layout: [before, fullMatch, name, content, fullMatch, name, content, ...]
  // Index 0 = text before first marker
  // Then groups of 3: fullMatch, capturedName, textAfterUntilNextSplit

  let i = 0;

  // Text before first marker
  if (parts[0]?.trim()) {
    blocks.push({ type: 'text', title: '', raw: parts[0].trim() });
  }
  i = 1;

  // Process each section
  while (i < parts.length) {
    // parts[i] = full match (═══ NAME ═══), parts[i+1] = captured name, parts[i+2] = content after
    const sectionName = parts[i + 1]?.trim() || '';
    const content = parts[i + 2] || '';
    const blockType = SECTION_MAP[sectionName] || 'text';

    blocks.push({
      type: blockType,
      title: sectionName,
      raw: content.trim(),
    });

    i += 3;
  }

  // Post-process: extract arb alerts and trade confirmations from blocks
  const result: ParsedBlock[] = [];

  for (const block of blocks) {
    if (block.type === 'recommendation') {
      // Split arb alerts out of recommendation block
      const lines = block.raw.split('\n');
      const recLines: string[] = [];
      const arbLines: string[] = [];
      let inArb = false;

      for (const line of lines) {
        if (line.includes('⚡ ARB ALERT') || line.includes('⚡ ARBITRAGE')) {
          inArb = true;
          arbLines.push(line);
        } else if (inArb && (line.startsWith(' ') || line.startsWith('\t') || line.includes('→') || line.includes('Profit') || line.includes('profit'))) {
          arbLines.push(line);
        } else {
          inArb = false;
          recLines.push(line);
        }
      }

      if (recLines.some(l => l.trim())) {
        result.push({ type: 'recommendation', title: block.title, raw: recLines.join('\n').trim() });
      }
      if (arbLines.length > 0) {
        result.push({ type: 'arb_alert', title: 'ARB ALERT', raw: arbLines.join('\n').trim() });
      }
    } else {
      result.push(block);
    }
  }

  // Extract trade confirmations from any block
  const final: ParsedBlock[] = [];
  for (const block of result) {
    const lines = block.raw.split('\n');
    const mainLines: string[] = [];
    const tradeLines: string[] = [];

    for (const line of lines) {
      if (line.includes('✓') && (line.toLowerCase().includes('filled') || line.toLowerCase().includes('placed') || line.toLowerCase().includes('executed'))) {
        tradeLines.push(line);
      } else if (line.toLowerCase().includes('filled') && line.includes('✓')) {
        tradeLines.push(line);
      } else {
        mainLines.push(line);
      }
    }

    if (mainLines.some(l => l.trim())) {
      final.push({ ...block, raw: mainLines.join('\n').trim() });
    }
    if (tradeLines.length > 0) {
      final.push({ type: 'trade_confirm', title: 'TRADE CONFIRMED', raw: tradeLines.join('\n').trim() });
    }
  }

  return final;
}
