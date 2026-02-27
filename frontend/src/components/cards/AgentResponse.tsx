import { useRef, useEffect, memo, useMemo } from 'react';
import gsap from 'gsap';
import type { ParsedBlock } from '../../lib/parseAgentResponse';
import {
  MarketTableCard,
  ResearchCard,
  EdgeCard,
  RecommendationCard,
  ArbScanCard,
  ArbAlertCard,
  TradeConfirmCard,
  TextBlock,
} from './index';

const CARD_MAP: Record<string, React.ComponentType<{ raw: string; title?: string; onAction?: (text: string) => void }>> = {
  market_table: MarketTableCard,
  research: ResearchCard,
  edge: EdgeCard,
  recommendation: RecommendationCard,
  arb_scan: ArbScanCard,
  arb_alert: ArbAlertCard,
  trade_confirm: TradeConfirmCard,
  text: TextBlock,
};

interface Props {
  blocks: ParsedBlock[];
  onAction?: (text: string) => void;
}

export default memo(function AgentResponse({ blocks, onAction }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animatedRef = useRef(false);

  useEffect(() => {
    // Only animate once on mount, never re-trigger
    if (animatedRef.current || !containerRef.current) return;
    const cards = containerRef.current.children;
    if (cards.length === 0) return;
    animatedRef.current = true;

    gsap.fromTo(
      cards,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, stagger: 0.12, duration: 0.4, ease: 'power2.out' },
    );
  }, [blocks]);

  const rendered = useMemo(() =>
    blocks.map((block, i) => {
      const Component = CARD_MAP[block.type] || TextBlock;
      return (
        <div key={`${block.type}-${i}`} style={{ opacity: 0 }}>
          <Component raw={block.raw} title={block.title} onAction={onAction} />
        </div>
      );
    }),
    [blocks, onAction],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        fontFamily: 'var(--mono)',
        fontSize: 9,
        color: 'var(--t3)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}>Flash</div>
      <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rendered}
      </div>
    </div>
  );
});
