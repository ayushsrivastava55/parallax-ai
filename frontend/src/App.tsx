import { LiveTicker } from './components/LiveTicker';
import { TerminalDemo } from './components/TerminalDemo';
import { ArbitragePulse } from './components/ArbitragePulse';
import { BundleMonitor } from './components/BundleMonitor';
import { YieldStatus } from './components/YieldStatus';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/* ── Layout primitives ────────────────────────────── */

const WRAP = 1080;

function Section({ children, id, style }: { children: ReactNode; id?: string; style?: CSSProperties }) {
  return (
    <section id={id} data-reveal style={{
      maxWidth: WRAP,
      margin: '0 auto',
      padding: '0 28px',
      ...style,
    }}>
      {children}
    </section>
  );
}


/* ── Scroll reveal ────────────────────────────────── */

function useReveal() {
  const seen = useRef(new Set<Element>());
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting && !seen.current.has(e.target)) {
          seen.current.add(e.target);
          const el = e.target as HTMLElement;
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        }
      });
    }, { threshold: 0.06, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('[data-reveal]').forEach(el => {
      const h = el as HTMLElement;
      h.style.opacity = '0';
      h.style.transform = 'translateY(18px)';
      h.style.transition = 'opacity 0.65s cubic-bezier(0.23,1,0.32,1), transform 0.65s cubic-bezier(0.23,1,0.32,1)';
      obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);
}

/* ── Navbar ────────────────────────────────────────── */

function Nav() {
  return (
    <nav style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      height: 52,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 28px',
      background: 'rgba(10,10,10,0.85)',
      backdropFilter: 'blur(10px)',
      borderBottom: '1px solid var(--line)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 24,
          height: 24,
          background: 'var(--gold)',
          borderRadius: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--mono)',
          fontSize: 12,
          fontWeight: 700,
          color: '#0a0a0a',
        }}>F</div>
        <span style={{ fontFamily: 'var(--sans)', fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}>Flash</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <a href="#how" style={{ fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--t2)' }}>How it works</a>
        <a href="#demo" style={{ fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--t2)' }}>Demo</a>
        <a href="#arb" style={{ fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--t2)' }}>Arbitrage</a>
        <Link to="/chat" style={{
          fontFamily: 'var(--mono)',
          fontSize: 11,
          fontWeight: 600,
          color: '#0a0a0a',
          background: 'var(--gold)',
          padding: '6px 16px',
          borderRadius: 3,
          letterSpacing: '0.02em',
        }}>Launch</Link>
      </div>
    </nav>
  );
}

/* ── Hero ──────────────────────────────────────────── */

function Hero() {
  return (
    <section style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      padding: '0 28px',
      maxWidth: WRAP,
      margin: '0 auto',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 48,
        alignItems: 'center',
        width: '100%',
        paddingTop: 52,
      }}>
        {/* Left — Copy */}
        <div>
          <div style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            fontWeight: 500,
            color: 'var(--t3)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            animation: 'fadeUp 0.5s ease both',
          }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--green)' }} />
            Live on BNB Chain
          </div>

          <h1 style={{
            fontFamily: 'var(--serif)',
            fontSize: 'clamp(40px, 5.5vw, 64px)',
            fontWeight: 400,
            lineHeight: 1.08,
            letterSpacing: '-0.02em',
            marginBottom: 24,
            animation: 'fadeUp 0.6s ease 0.08s both',
          }}>
            Prediction markets,{' '}
            <em style={{
              fontStyle: 'italic',
              color: 'var(--gold)',
            }}>
              dissected.
            </em>
          </h1>

          <p style={{
            fontFamily: 'var(--sans)',
            fontSize: 15,
            lineHeight: 1.65,
            color: 'var(--t2)',
            maxWidth: 400,
            marginBottom: 32,
            animation: 'fadeUp 0.6s ease 0.16s both',
          }}>
            Flash researches what you believe, finds where the market is
            wrong, and waits for your call. An AI agent for BNB Chain
            that never trades without permission.
          </p>

          <div style={{
            display: 'flex',
            gap: 10,
            animation: 'fadeUp 0.6s ease 0.24s both',
          }}>
            <Link to="/chat" style={{
              fontFamily: 'var(--mono)',
              fontSize: 12,
              fontWeight: 600,
              color: '#0a0a0a',
              background: 'var(--gold)',
              padding: '10px 22px',
              borderRadius: 3,
              letterSpacing: '0.02em',
            }}>
              Try Flash live
            </Link>
            <a href="#how" style={{
              fontFamily: 'var(--mono)',
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--t2)',
              border: '1px solid var(--line)',
              padding: '10px 22px',
              borderRadius: 3,
              letterSpacing: '0.02em',
            }}>
              How it works
            </a>
          </div>
        </div>

        {/* Right — Terminal preview */}
        <div style={{
          animation: 'fadeUp 0.7s ease 0.3s both',
          transform: 'translateY(20px)',
        }}>
          <TerminalDemo />
        </div>
      </div>
    </section>
  );
}


/* ── How it works ─────────────────────────────────── */

function HowItWorks() {
  return (
    <Section id="how" style={{ paddingTop: 120, paddingBottom: 0 }}>
      <h2 style={{
        fontFamily: 'var(--serif)',
        fontSize: 'clamp(28px, 4vw, 42px)',
        fontWeight: 400,
        lineHeight: 1.1,
        letterSpacing: '-0.02em',
        marginBottom: 56,
      }}>
        Thesis to trade, <em style={{ fontStyle: 'italic', color: 'var(--t2)' }}>one conversation.</em>
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px 64px' }}>
        {[
          {
            title: 'Share your thesis',
            body: 'Say what you believe in plain language, or paste a market URL. Flash handles the rest.',
            example: '"I think BTC holds above $95k through the weekend"',
          },
          {
            title: 'Flash researches',
            body: 'Autonomous web search — news, sentiment, on-chain signals, historical patterns — to build a probability model.',
            example: 'Scanning 12 sources... Model probability: 71%',
          },
          {
            title: 'See the edge',
            body: 'Model vs market implied probability, expected value per dollar risked, cross-platform comparison, arb detection.',
            example: 'Edge: +13% | EV: +$0.22 per $1 | Confidence: High',
          },
          {
            title: 'You decide',
            body: 'Flash never auto-trades. Every position needs your explicit go-ahead. Modify size, reject, or confirm.',
            example: '"Execute option 1, 200 shares"',
          },
        ].map((s, i) => (
          <div key={i}>
            <h3 style={{
              fontFamily: 'var(--sans)',
              fontSize: 16,
              fontWeight: 600,
              marginBottom: 8,
              color: 'var(--t1)',
            }}>{s.title}</h3>
            <p style={{
              fontFamily: 'var(--sans)',
              fontSize: 13.5,
              color: 'var(--t2)',
              lineHeight: 1.6,
              marginBottom: 12,
            }}>{s.body}</p>
            <p style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--t3)',
              lineHeight: 1.5,
            }}>{s.example}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ── Capabilities ─────────────────────────────────── */

function Capabilities() {
  return (
    <Section style={{ paddingTop: 120, paddingBottom: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '56px 40px' }}>
        {[
          { title: 'Deep research', body: 'Autonomous web search synthesized into a probability model. News, sentiment, on-chain signals.' },
          { title: 'Human-in-the-loop', body: 'Every trade requires explicit approval. Modify size, switch platforms, or reject entirely.' },
          { title: 'Cross-platform arb', body: 'Real-time price monitoring across Opinion.trade and Predict.fun. Locks risk-free profit on spreads.' },
          { title: 'On-chain identity', body: 'BAP-578 Non-Fungible Agent on BNB Chain. Verifiable history, immutable persona.' },
          { title: 'Multi-platform view', body: 'Prices, liquidity, and implied probability across platforms side-by-side. Best execution routing.' },
          { title: 'Chat-native', body: 'Trade through conversation — web chat or Telegram. Paste URLs, share theses, execute trades. No dashboards.' },
        ].map((c, i) => (
          <div key={i}>
            <h3 style={{
              fontFamily: 'var(--sans)',
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--t1)',
              marginBottom: 6,
            }}>{c.title}</h3>
            <p style={{
              fontFamily: 'var(--sans)',
              fontSize: 13,
              lineHeight: 1.55,
              color: 'var(--t3)',
            }}>{c.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ── Demo section ─────────────────────────────────── */

function DemoSection() {
  return (
    <Section id="demo" style={{ paddingTop: 120, paddingBottom: 0 }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <TerminalDemo />
      </div>
    </Section>
  );
}

/* ── Arbitrage section ────────────────────────────── */

function ArbSection() {
  return (
    <Section id="arb" style={{ paddingTop: 120, paddingBottom: 0 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 460px',
        gap: 56,
        alignItems: 'center',
      }}>
        <div>
          <h2 style={{
            fontFamily: 'var(--serif)',
            fontSize: 'clamp(28px, 4vw, 40px)',
            fontWeight: 400,
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            marginBottom: 20,
          }}>
            Same event, different prices.{' '}
            <em style={{ fontStyle: 'italic', color: 'var(--green)' }}>Locked profit.</em>
          </h2>
          <p style={{
            fontFamily: 'var(--sans)',
            fontSize: 14,
            lineHeight: 1.65,
            color: 'var(--t2)',
            maxWidth: 400,
          }}>
            Flash monitors price discrepancies between Opinion.trade and
            Predict.fun. Buy YES on one, NO on the other — when the combined cost
            is under $1.00, profit is guaranteed regardless of the outcome.
          </p>
        </div>
        <ArbitragePulse />
      </div>
    </Section>
  );
}

function EngineSection() {
  return (
    <Section style={{ paddingTop: 90, paddingBottom: 0 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 18,
      }}>
        <BundleMonitor />
        <YieldStatus />
      </div>
    </Section>
  );
}

/* ── Footer ───────────────────────────────────────── */

function Footer() {
  return (
    <footer style={{
      maxWidth: WRAP,
      margin: '0 auto',
      padding: '120px 28px 32px',
    }}>
      {/* Stack as a simple inline list */}
      <div style={{
        fontFamily: 'var(--mono)',
        fontSize: 11,
        color: 'var(--t3)',
        marginBottom: 40,
        lineHeight: 2,
      }}>
        Built with{' '}
        {['ElizaOS', 'Predict.fun', 'Opinion.trade', 'BAP-578', 'Claude', 'BNB Chain'].map((t, i) => (
          <span key={i}>
            <span style={{ color: 'var(--t2)' }}>{t}</span>
            {i < 5 ? <span style={{ color: 'var(--line-light)', margin: '0 8px' }}>/</span> : ''}
          </span>
        ))}
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 20,
        borderTop: '1px solid var(--line)',
      }}>
        <span style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--t3)' }}>
          BNB Chain x YZi Labs Hackathon 2026
        </span>
        <span style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--t3)' }}>
          Flash does not provide financial advice.
        </span>
      </div>
    </footer>
  );
}

/* ── App ──────────────────────────────────────────── */

export default function App() {
  useReveal();

  // Enable grain overlay on landing page only
  useEffect(() => {
    document.body.classList.add('show-grain');
    return () => { document.body.classList.remove('show-grain'); };
  }, []);

  return (
    <>
      <Nav />
      <Hero />
      <LiveTicker />
      <div data-reveal><HowItWorks /></div>
      <div data-reveal><Capabilities /></div>
      <div data-reveal><DemoSection /></div>
      <div data-reveal><ArbSection /></div>
      <div data-reveal><EngineSection /></div>
      <Footer />
    </>
  );
}
