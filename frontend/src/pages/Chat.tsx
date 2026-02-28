import { useEffect, useRef, memo } from 'react';
import { Link } from 'react-router-dom';
import { useChat, type Message } from '../hooks/useChat';
import { parseAgentResponse, type ParsedBlock } from '../lib/parseAgentResponse';
import AgentResponse from '../components/cards/AgentResponse';

/* ── Suggestions ─────────────────────────────────── */

const SUGGESTIONS = [
  'I think BTC holds above $95k through the weekend',
  'Find me arbitrage opportunities',
  'What prediction markets are active?',
  'Analyze ETH > $4k by March',
];

/* ── Static sub-components ───────────────────────── */

function UserBubble({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{
        maxWidth: 640,
        fontFamily: 'var(--sans)',
        fontSize: 14,
        lineHeight: 1.7,
        padding: '10px 16px',
        borderRadius: 3,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        background: 'var(--gold)',
        color: '#0a0a0a',
        fontWeight: 500,
      }}>
        {text}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div>
      <div style={{
        fontFamily: 'var(--mono)',
        fontSize: 9,
        color: 'var(--t3)',
        letterSpacing: '0.08em',
        marginBottom: 4,
        textTransform: 'uppercase',
      }}>Flash</div>
      <div style={{
        fontFamily: 'var(--mono)',
        fontSize: 12,
        padding: '14px 18px',
        borderRadius: 3,
        background: '#111',
        border: '1px solid var(--line)',
        color: 'var(--t3)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: 'var(--gold)',
            animation: `pulse-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

/* ── Message rendering — cached parsed blocks ────── */

// Keep parse cache outside React to survive re-renders
const blockCache = new Map<string, ParsedBlock[]>();

const AssistantMessage = memo(function AssistantMessage({
  msg,
  onAction,
}: {
  msg: Message;
  onAction: (t: string) => void;
}) {
  let blocks = blockCache.get(msg.id);
  if (!blocks) {
    blocks = parseAgentResponse(msg.text);
    blockCache.set(msg.id, blocks);
  }
  return <AgentResponse blocks={blocks} onAction={onAction} />;
});

/* ── Chat page ───────────────────────────────────── */

export default function Chat() {
  const { agentName, messages, send, phase, connected, streamRef } = useChat();
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages or phase change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, phase]);

  // Focus input when connected
  useEffect(() => {
    if (connected) inputRef.current?.focus();
  }, [connected]);

  function doSend(text?: string) {
    const msg = (text || inputRef.current?.value || '').trim();
    if (!msg) return;
    if (inputRef.current) inputRef.current.value = '';
    send(msg);
  }

  const isEmpty = messages.length === 0 && phase === 'idle';

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg)',
    }}>
      {/* ── Header ──────────────────────────────── */}
      <header style={{
        height: 52,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        borderBottom: '1px solid var(--line)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/" style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'var(--t3)',
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span style={{ fontSize: 14 }}>&larr;</span>
            Home
          </Link>
          <div style={{ width: 1, height: 16, background: 'var(--line)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 20,
              height: 20,
              background: 'var(--gold)',
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--mono)',
              fontSize: 9,
              fontWeight: 700,
              color: '#0a0a0a',
            }}>F</div>
            <span style={{
              fontFamily: 'var(--sans)',
              fontSize: 13,
              fontWeight: 600,
            }}>{agentName}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: connected ? 'var(--green)' : 'var(--t3)',
            animation: connected ? 'pulse-dot 2s ease infinite' : 'none',
          }} />
          <span style={{
            fontFamily: 'var(--mono)',
            fontSize: 9,
            color: connected ? 'var(--green)' : 'var(--t3)',
            letterSpacing: '0.06em',
          }}>
            {connected ? 'CONNECTED' : 'OFFLINE'}
          </span>
        </div>
      </header>

      {/* ── Messages ────────────────────────────── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 24,
      }}>
        <div style={{
          maxWidth: 800,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          minHeight: '100%',
        }}>
          {/* Empty state */}
          {isEmpty && (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 24,
              paddingBottom: 80,
            }}>
              <div style={{
                width: 44,
                height: 44,
                background: 'var(--gold)',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--mono)',
                fontSize: 20,
                fontWeight: 700,
                color: '#0a0a0a',
              }}>F</div>
              <div style={{ textAlign: 'center' }}>
                <h2 style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 28,
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  marginBottom: 8,
                }}>
                  What's your thesis?
                </h2>
                <p style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 13,
                  color: 'var(--t2)',
                  maxWidth: 360,
                  lineHeight: 1.5,
                }}>
                  Share what you believe, paste a market URL, or ask Flash to scan for opportunities.
                </p>
              </div>

              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                justifyContent: 'center',
                maxWidth: 500,
              }}>
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => doSend(s)}
                    disabled={!connected}
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 11,
                      color: 'var(--t2)',
                      border: '1px solid var(--line)',
                      padding: '8px 14px',
                      borderRadius: 3,
                      letterSpacing: '0.01em',
                      opacity: connected ? 1 : 0.4,
                    }}
                    onMouseEnter={e => {
                      (e.target as HTMLElement).style.borderColor = 'var(--line-light)';
                      (e.target as HTMLElement).style.color = 'var(--t1)';
                    }}
                    onMouseLeave={e => {
                      (e.target as HTMLElement).style.borderColor = 'var(--line)';
                      (e.target as HTMLElement).style.color = 'var(--t2)';
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message list */}
          {messages.map(m =>
            m.role === 'user'
              ? <UserBubble key={m.id} text={m.text} />
              : <AssistantMessage key={m.id} msg={m} onAction={doSend} />,
          )}

          {/* Streaming bubble */}
          {phase === 'streaming' && (
            <div>
              <div style={{
                fontFamily: 'var(--mono)',
                fontSize: 9,
                color: 'var(--t3)',
                letterSpacing: '0.08em',
                marginBottom: 4,
                textTransform: 'uppercase',
              }}>Flash</div>
              <div style={{
                display: 'inline-block',
                maxWidth: 720,
                fontFamily: 'var(--mono)',
                fontSize: 12,
                lineHeight: 1.7,
                padding: '14px 18px',
                borderRadius: 3,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: '#111',
                color: 'var(--t1)',
                border: '1px solid var(--line)',
              }}>
                <span ref={streamRef} />
                <span style={{
                  display: 'inline-block',
                  width: 6,
                  height: 14,
                  background: 'var(--gold)',
                  animation: 'blink 1s step-end infinite',
                  verticalAlign: 'middle',
                  marginLeft: 3,
                }} />
              </div>
            </div>
          )}

          {/* Thinking indicator */}
          {phase === 'thinking' && <ThinkingDots />}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input ───────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        borderTop: '1px solid var(--line)',
        padding: '16px 24px',
      }}>
        <div style={{
          maxWidth: 800,
          margin: '0 auto',
          display: 'flex',
          gap: 10,
        }}>
          <input
            ref={inputRef}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                doSend();
              }
            }}
            placeholder={connected
              ? 'Share a thesis, paste a market URL, or ask anything...'
              : 'Connecting to Flash agent...'
            }
            disabled={!connected}
            style={{
              flex: 1,
              fontFamily: 'var(--sans)',
              fontSize: 14,
              color: 'var(--t1)',
              background: '#111',
              border: '1px solid var(--line)',
              borderRadius: 3,
              padding: '12px 16px',
              outline: 'none',
            }}
            onFocus={e => (e.target as HTMLElement).style.borderColor = 'var(--line-light)'}
            onBlur={e => (e.target as HTMLElement).style.borderColor = 'var(--line)'}
          />
          <button
            onClick={() => doSend()}
            disabled={!connected || phase !== 'idle'}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 12,
              fontWeight: 600,
              color: '#0a0a0a',
              background: connected ? 'var(--gold)' : 'var(--line)',
              padding: '12px 24px',
              borderRadius: 3,
              letterSpacing: '0.02em',
              opacity: phase !== 'idle' ? 0.5 : 1,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
