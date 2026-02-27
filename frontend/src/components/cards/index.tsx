import { type CSSProperties, useState } from 'react';

/* ── Shared Card shell ─────────────────────────────── */

interface CardProps {
  children: React.ReactNode;
  accent?: string;
  style?: CSSProperties;
}

function Card({ children, accent, style }: CardProps) {
  return (
    <div style={{
      background: '#111',
      border: '1px solid var(--line)',
      borderLeft: accent ? `3px solid ${accent}` : '1px solid var(--line)',
      borderRadius: 2,
      padding: '18px 20px',
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--mono)',
      fontSize: 9,
      color: 'var(--t3)',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      marginBottom: 14,
    }}>
      {children}
    </div>
  );
}

/* ── MarketTableCard ───────────────────────────────── */

interface MarketTableCardProps {
  raw: string;
  title?: string;
  onAction?: (text: string) => void;
}

function parsePlatformColor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('predict')) return 'var(--green)';
  if (lower.includes('opinion')) return 'var(--gold)';
  if (lower.includes('polymarket')) return 'var(--cyan)';
  return 'var(--t2)';
}

export function MarketTableCard({ raw, title }: MarketTableCardProps) {
  // Parse │-separated table rows
  const lines = raw.split('\n').filter(l => l.trim());
  const rows: { platform: string; market: string; yesPrice: string; prob: number; liquidity: string }[] = [];

  for (const line of lines) {
    if (!line.includes('│')) continue;
    const cells = line.split('│').map(c => c.trim()).filter(Boolean);
    // Skip header separator lines
    if (cells.some(c => /^[-─═]+$/.test(c))) continue;
    // Skip header row (look for "Platform" or "Market" text)
    if (cells.some(c => c.toLowerCase() === 'platform' || c.toLowerCase() === 'market')) continue;

    if (cells.length >= 3) {
      const probStr = cells[2] || cells[3] || '';
      const probNum = parseFloat(probStr.replace('%', '').replace('$', '').replace('¢', '')) || 0;
      rows.push({
        platform: cells[0] || '',
        market: cells[1] || '',
        yesPrice: cells[2] || '',
        prob: probNum > 1 ? probNum : probNum * 100,
        liquidity: cells[3] || cells[4] || '',
      });
    }
  }

  // If no table rows parsed, show as text
  if (rows.length === 0) {
    return <TextBlock raw={raw} title={title} />;
  }

  return (
    <Card>
      <SectionLabel>{title || 'MARKETS'}</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {rows.map((row, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto auto',
            gap: 16,
            alignItems: 'center',
            padding: '10px 0',
            borderBottom: i < rows.length - 1 ? '1px solid var(--line)' : 'none',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <div style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: parsePlatformColor(row.platform),
                  flexShrink: 0,
                }} />
                <span style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  color: 'var(--t2)',
                  letterSpacing: '0.04em',
                }}>{row.platform}</span>
              </div>
              <div style={{
                fontFamily: 'var(--sans)',
                fontSize: 13,
                color: 'var(--t1)',
                lineHeight: 1.4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>{row.market}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontFamily: 'var(--mono)',
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--gold)',
              }}>{row.yesPrice}</div>
              <div style={{
                width: 60,
                height: 3,
                background: 'var(--line)',
                borderRadius: 2,
                marginTop: 4,
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${Math.min(row.prob, 100)}%`,
                  height: '100%',
                  background: 'var(--gold)',
                  borderRadius: 2,
                  opacity: 0.6,
                }} />
              </div>
            </div>
            {row.liquidity && (
              <div style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: 'var(--t3)',
                textAlign: 'right',
                minWidth: 50,
              }}>{row.liquidity}</div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ── ResearchCard ───────────────────────────────────── */

export function ResearchCard({ raw, title }: { raw: string; title?: string; onAction?: (text: string) => void }) {
  const lines = raw.split('\n');
  const supporting: string[] = [];
  const contradicting: string[] = [];
  const other: string[] = [];

  let section: 'none' | 'supporting' | 'contradicting' = 'none';

  for (const line of lines) {
    const lower = line.toLowerCase().trim();
    if (lower.includes('supporting') && (lower.includes(':') || lower.includes('evidence') || lower.includes('factor'))) {
      section = 'supporting';
      continue;
    }
    if (lower.includes('contradicting') && (lower.includes(':') || lower.includes('evidence') || lower.includes('factor'))) {
      section = 'contradicting';
      continue;
    }
    if (lower.includes('opposing') && (lower.includes(':') || lower.includes('evidence') || lower.includes('factor'))) {
      section = 'contradicting';
      continue;
    }

    const cleaned = line.replace(/^[\s•●▸▹►–\-*]+/, '').trim();
    if (!cleaned) continue;

    if (section === 'supporting') supporting.push(cleaned);
    else if (section === 'contradicting') contradicting.push(cleaned);
    else other.push(line);
  }

  // If we couldn't parse columns, show as text
  if (supporting.length === 0 && contradicting.length === 0) {
    return <TextBlock raw={raw} title={title} />;
  }

  const Column = ({ items, color, label }: { items: string[]; color: string; label: string }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        fontFamily: 'var(--mono)',
        fontSize: 9,
        color,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        marginBottom: 10,
      }}>{label}</div>
      <div style={{
        borderLeft: `2px solid ${color}`,
        paddingLeft: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        {items.map((item, i) => (
          <div key={i} style={{
            fontFamily: 'var(--sans)',
            fontSize: 12,
            color: 'var(--t1)',
            lineHeight: 1.6,
          }}>
            <span style={{ color, marginRight: 6, fontSize: 8 }}>●</span>
            {item}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <Card>
      <SectionLabel>{title || 'RESEARCH FINDINGS'}</SectionLabel>
      {other.length > 0 && (
        <div style={{
          fontFamily: 'var(--sans)',
          fontSize: 12,
          color: 'var(--t2)',
          lineHeight: 1.6,
          marginBottom: 14,
        }}>
          {other.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
      <div style={{
        display: 'grid',
        gridTemplateColumns: supporting.length > 0 && contradicting.length > 0 ? '1fr 1fr' : '1fr',
        gap: 20,
      }}>
        {supporting.length > 0 && <Column items={supporting} color="var(--green)" label="Supporting" />}
        {contradicting.length > 0 && <Column items={contradicting} color="var(--red)" label="Contradicting" />}
      </div>
    </Card>
  );
}

/* ── EdgeCard — visual centerpiece ─────────────────── */

export function EdgeCard({ raw, title }: { raw: string; title?: string; onAction?: (text: string) => void }) {
  const lines = raw.split('\n');
  const kv: Record<string, string> = {};
  const otherLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^[\s│]*([A-Za-z\s]+?):\s*(.+)$/);
    if (match) {
      kv[match[1].trim().toLowerCase()] = match[2].trim();
    } else if (line.trim()) {
      otherLines.push(line.trim());
    }
  }

  const modelProb = parseFloat(kv['model probability'] || kv['model prob'] || kv['estimated probability'] || '0');
  const marketProb = parseFloat(kv['market probability'] || kv['market price'] || kv['current price'] || kv['market prob'] || '0');
  const edge = parseFloat(kv['edge'] || kv['edge detected'] || kv['expected edge'] || '0');
  const ev = kv['expected value'] || kv['ev'] || kv['expected profit'] || '';
  const confidence = kv['confidence'] || kv['confidence level'] || '';
  const risk = kv['risk'] || kv['risk score'] || kv['risk level'] || '';

  const hasVisualization = modelProb > 0 || edge !== 0;

  const confidenceColor = () => {
    const lower = confidence.toLowerCase();
    if (lower.includes('high')) return 'var(--green)';
    if (lower.includes('medium') || lower.includes('moderate')) return 'var(--gold)';
    return 'var(--red)';
  };

  return (
    <Card style={{ borderColor: 'var(--line-light)' }}>
      <SectionLabel>{title || 'STATISTICAL EVALUATION'}</SectionLabel>

      {hasVisualization && (
        <div style={{ marginBottom: 18 }}>
          {/* Probability bar */}
          <div style={{
            position: 'relative',
            height: 32,
            background: 'var(--line)',
            borderRadius: 2,
            overflow: 'visible',
            marginBottom: 8,
          }}>
            {/* Market prob marker */}
            {marketProb > 0 && (
              <div style={{
                position: 'absolute',
                left: `${Math.min(marketProb, 100)}%`,
                top: 0,
                bottom: 0,
                width: 2,
                background: 'var(--t2)',
                zIndex: 1,
              }}>
                <div style={{
                  position: 'absolute',
                  top: -18,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontFamily: 'var(--mono)',
                  fontSize: 9,
                  color: 'var(--t3)',
                  whiteSpace: 'nowrap',
                }}>MKT {marketProb.toFixed(0)}%</div>
              </div>
            )}
            {/* Model prob marker */}
            {modelProb > 0 && (
              <div style={{
                position: 'absolute',
                left: `${Math.min(modelProb, 100)}%`,
                top: 0,
                bottom: 0,
                width: 2,
                background: 'var(--gold)',
                zIndex: 2,
              }}>
                <div style={{
                  position: 'absolute',
                  bottom: -18,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontFamily: 'var(--mono)',
                  fontSize: 9,
                  color: 'var(--gold)',
                  whiteSpace: 'nowrap',
                }}>MODEL {modelProb.toFixed(0)}%</div>
              </div>
            )}
            {/* Edge highlight zone */}
            {marketProb > 0 && modelProb > 0 && (
              <div style={{
                position: 'absolute',
                left: `${Math.min(marketProb, modelProb)}%`,
                width: `${Math.abs(modelProb - marketProb)}%`,
                top: 0,
                bottom: 0,
                background: 'rgba(240, 185, 11, 0.15)',
                zIndex: 0,
              }} />
            )}
          </div>
        </div>
      )}

      {/* Edge number — hero */}
      {edge !== 0 && (
        <div style={{
          fontFamily: 'var(--serif)',
          fontSize: 42,
          fontWeight: 400,
          color: edge > 0 ? 'var(--gold)' : 'var(--red)',
          letterSpacing: '-0.02em',
          lineHeight: 1,
          marginBottom: 4,
          marginTop: hasVisualization ? 12 : 0,
        }}>
          {edge > 0 ? '+' : ''}{edge.toFixed(1)}%
          <span style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'var(--t3)',
            letterSpacing: '0.06em',
            marginLeft: 10,
            verticalAlign: 'middle',
          }}>EDGE</span>
        </div>
      )}

      {/* Stats grid */}
      {(ev || confidence || risk) && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
          gap: 12,
          marginTop: 16,
          paddingTop: 16,
          borderTop: '1px solid var(--line)',
        }}>
          {ev && (
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t3)', letterSpacing: '0.06em', marginBottom: 4 }}>EV</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--t1)', fontWeight: 500 }}>{ev}</div>
            </div>
          )}
          {confidence && (
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t3)', letterSpacing: '0.06em', marginBottom: 4 }}>CONFIDENCE</div>
              <div style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: confidenceColor(),
                background: `${confidenceColor()}15`,
                padding: '3px 8px',
                borderRadius: 2,
                display: 'inline-block',
              }}>{confidence}</div>
            </div>
          )}
          {risk && (
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t3)', letterSpacing: '0.06em', marginBottom: 4 }}>RISK</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--t1)', fontWeight: 500 }}>{risk}</div>
            </div>
          )}
        </div>
      )}

      {/* Any other lines */}
      {otherLines.length > 0 && (
        <div style={{
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: 'var(--t2)',
          lineHeight: 1.6,
          marginTop: 12,
          whiteSpace: 'pre-wrap',
        }}>
          {otherLines.join('\n')}
        </div>
      )}
    </Card>
  );
}

/* ── RecommendationCard ────────────────────────────── */

export function RecommendationCard({ raw, title, onAction }: { raw: string; title?: string; onAction?: (text: string) => void }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const lines = raw.split('\n').filter(l => l.trim());
  const actionLine: string[] = [];
  const options: { num: string; label: string; desc: string }[] = [];

  for (const line of lines) {
    // Match numbered options: "1. Label — Description" or "1) Label: Description"
    const optMatch = line.match(/^\s*(\d+)[.)]\s*(.+?)(?:\s*[—–:\-]\s*(.+))?$/);
    if (optMatch) {
      options.push({
        num: optMatch[1],
        label: optMatch[2].trim(),
        desc: optMatch[3]?.trim() || '',
      });
    } else {
      actionLine.push(line.trim());
    }
  }

  return (
    <Card accent="var(--gold)">
      <SectionLabel>{title || 'RECOMMENDATION'}</SectionLabel>

      {actionLine.length > 0 && (
        <div style={{
          fontFamily: 'var(--sans)',
          fontSize: 14,
          color: 'var(--gold)',
          fontWeight: 500,
          lineHeight: 1.6,
          marginBottom: options.length > 0 ? 16 : 0,
        }}>
          {actionLine.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      {options.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {options.map((opt, i) => (
            <div
              key={i}
              onClick={() => onAction?.(`Execute option ${opt.num}`)}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 2,
                border: `1px solid ${hoveredIdx === i ? 'var(--gold)' : 'var(--line)'}`,
                cursor: onAction ? 'pointer' : 'default',
                transition: 'border-color 0.15s ease',
              }}
            >
              <div style={{
                width: 22,
                height: 22,
                borderRadius: 2,
                background: hoveredIdx === i ? 'var(--gold)' : 'var(--line)',
                color: hoveredIdx === i ? '#0a0a0a' : 'var(--t2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--mono)',
                fontSize: 11,
                fontWeight: 600,
                flexShrink: 0,
                transition: 'background 0.15s ease, color 0.15s ease',
              }}>{opt.num}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 13,
                  color: 'var(--t1)',
                  fontWeight: 500,
                }}>{opt.label}</div>
                {opt.desc && (
                  <div style={{
                    fontFamily: 'var(--sans)',
                    fontSize: 11,
                    color: 'var(--t2)',
                    lineHeight: 1.5,
                    marginTop: 2,
                  }}>{opt.desc}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ── ArbScanCard ───────────────────────────────────── */

export function ArbScanCard({ raw, title }: { raw: string; title?: string; onAction?: (text: string) => void }) {
  // Parse "Opportunity #N" blocks
  const blocks: { title: string; legs: string[]; profit: string; summary: string[] }[] = [];
  const summaryLines: string[] = [];
  let current: typeof blocks[0] | null = null;

  const lines = raw.split('\n');

  for (const line of lines) {
    const oppMatch = line.match(/Opportunity\s*#?(\d+)/i);
    if (oppMatch) {
      if (current) blocks.push(current);
      current = { title: `Opportunity #${oppMatch[1]}`, legs: [], profit: '', summary: [] };
      continue;
    }

    if (current) {
      if (line.includes('→') || line.includes('➜')) {
        current.legs.push(line.trim());
      } else if (line.toLowerCase().includes('profit') || line.toLowerCase().includes('return')) {
        const profitMatch = line.match(/([\d.]+%|\$[\d,.]+|[\d.]+\s*%)/);
        current.profit = profitMatch ? profitMatch[1] : line.trim();
        current.summary.push(line.trim());
      } else if (line.trim()) {
        current.summary.push(line.trim());
      }
    } else if (line.trim()) {
      summaryLines.push(line.trim());
    }
  }
  if (current) blocks.push(current);

  if (blocks.length === 0) {
    return <TextBlock raw={raw} title={title} />;
  }

  return (
    <Card>
      <SectionLabel>{title || 'ARBITRAGE SCAN'}</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {blocks.map((opp, i) => (
          <div key={i} style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--line)',
            borderRadius: 2,
            padding: '14px 16px',
          }}>
            <div style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'var(--t2)',
              letterSpacing: '0.06em',
              marginBottom: 8,
            }}>{opp.title}</div>

            {/* Legs as flow */}
            {opp.legs.length > 0 && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                marginBottom: 10,
              }}>
                {opp.legs.map((leg, j) => (
                  <div key={j} style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: 'var(--cyan)',
                    lineHeight: 1.5,
                  }}>{leg}</div>
                ))}
              </div>
            )}

            {/* Profit */}
            {opp.profit && (
              <div style={{
                fontFamily: 'var(--mono)',
                fontSize: 18,
                fontWeight: 600,
                color: 'var(--green)',
              }}>{opp.profit}</div>
            )}

            {/* Summary info */}
            {opp.summary.length > 0 && (
              <div style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: 'var(--t2)',
                lineHeight: 1.6,
                marginTop: 6,
              }}>
                {opp.summary.map((s, j) => <div key={j}>{s}</div>)}
              </div>
            )}
          </div>
        ))}
      </div>

      {summaryLines.length > 0 && (
        <div style={{
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: 'var(--t2)',
          lineHeight: 1.6,
          marginTop: 12,
          paddingTop: 12,
          borderTop: '1px solid var(--line)',
        }}>
          {summaryLines.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </Card>
  );
}

/* ── ArbAlertCard — compact inline banner ──────────── */

export function ArbAlertCard({ raw }: { raw: string; title?: string; onAction?: (text: string) => void }) {
  const lines = raw.split('\n').filter(l => l.trim());
  const desc = lines.map(l => l.replace(/⚡\s*(ARB ALERT|ARBITRAGE)[:!]?\s*/i, '').trim()).filter(Boolean).join(' ');

  // Extract profit from the text
  const profitMatch = raw.match(/([\d.]+%|\$[\d,.]+\s*profit)/i);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 14px',
      background: 'rgba(240, 185, 11, 0.05)',
      borderLeft: '3px solid var(--gold)',
      borderRadius: 2,
    }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>⚡</span>
      <div style={{
        fontFamily: 'var(--sans)',
        fontSize: 12,
        color: 'var(--t1)',
        lineHeight: 1.5,
        flex: 1,
      }}>{desc}</div>
      {profitMatch && (
        <div style={{
          fontFamily: 'var(--mono)',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--green)',
          background: 'rgba(74, 222, 128, 0.1)',
          padding: '3px 8px',
          borderRadius: 2,
          flexShrink: 0,
        }}>{profitMatch[1]}</div>
      )}
    </div>
  );
}

/* ── TradeConfirmCard ──────────────────────────────── */

export function TradeConfirmCard({ raw }: { raw: string; title?: string; onAction?: (text: string) => void }) {
  const lines = raw.split('\n').filter(l => l.trim());

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      background: 'rgba(74, 222, 128, 0.05)',
      borderLeft: '3px solid var(--green)',
      borderRadius: 2,
    }}>
      <span style={{
        fontSize: 14,
        color: 'var(--green)',
        fontWeight: 700,
        flexShrink: 0,
      }}>✓</span>
      <div style={{
        fontFamily: 'var(--mono)',
        fontSize: 12,
        color: 'var(--t1)',
        lineHeight: 1.5,
      }}>
        {lines.map((l, i) => (
          <div key={i}>{l.replace(/✓\s*/, '')}</div>
        ))}
      </div>
    </div>
  );
}

/* ── TextBlock — fallback ──────────────────────────── */

export function TextBlock({ raw, title }: { raw: string; title?: string; onAction?: (text: string) => void }) {
  return (
    <Card>
      {title && <SectionLabel>{title}</SectionLabel>}
      <div style={{
        fontFamily: 'var(--mono)',
        fontSize: 12,
        lineHeight: 1.7,
        color: 'var(--t1)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {raw}
      </div>
    </Card>
  );
}
