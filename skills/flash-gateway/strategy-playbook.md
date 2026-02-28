---
name: strategy-playbook
version: 1.0.0
description: Master strategy guide for prediction market trading bots. Covers fundamentals, risk management, strategy selection, and capital allocation.
---

# Strategy Playbook

## How Prediction Markets Work

A prediction market prices outcomes as contracts between $0.00 and $1.00.

- **Price = implied probability.** A YES contract at $0.65 means the market implies a 65% chance of that outcome.
- **YES + NO = 1.00.** On a single platform, buying YES at $0.65 is equivalent to selling NO at $0.35.
- **Profit on resolution.** If you buy YES at $0.65 and the outcome resolves YES, you receive $1.00 — a $0.35 profit per contract.
- **Cross-platform divergence.** Different platforms can price the same outcome differently. When YES_A + NO_B < 1.00, an arbitrage opportunity exists. Flash Gateway supports 2 platforms (Predict.fun and Probable) for cross-platform arb scanning.

## Risk Management Principles

### Kelly Criterion (Simplified)

The Kelly fraction tells you how much of your bankroll to wager:

```
kelly_fraction = (edge * confidence) / odds
```

- **edge** = your_probability - market_probability
- **confidence** = how sure you are about your estimate (0.0–1.0)
- **odds** = payout ratio (for binary markets: 1 / market_price - 1)

Never bet the full Kelly amount. Use **half-Kelly** in practice.

### Hard Limits

| Rule | Value |
|------|-------|
| Max position size | 5% of total portfolio per trade |
| Stop-loss | Close position if value drops 30% from entry |
| Max correlated exposure | 15% of portfolio on related outcomes |
| Minimum edge to trade | 3% for arb, 5% for thesis-driven |
| Reserve floor | Always keep 20% portfolio in cash/stables |

## Strategy Selection Decision Tree

When the heartbeat fires, follow this decision tree top-to-bottom:

```
1. Run arb scan
   └─ Edge > 3% found?
      ├─ YES → Execute delta-neutral strategy (see strategy-delta-neutral.md)
      └─ NO → continue

2. Check thesis queue
   └─ Active thesis with edge > 5% and confidence > 0.6?
      ├─ YES → Execute thesis-driven trade (see strategy-thesis.md)
      └─ NO → continue

3. Check idle capital
   └─ Idle capital > $500?
      ├─ YES → Deploy to yield (see strategy-yield.md)
      └─ NO → do nothing, wait for next heartbeat
```

**Priority / urgency order:** arb > thesis > yield.

Arb opportunities are time-sensitive and disappear fast. Thesis trades have moderate urgency. Yield is passive and can always wait.

**Note:** With 2 platforms (Predict.fun and Probable), the arb scan covers cross-platform price differences. Always scan both platforms for the best opportunities.

## Capital Allocation

Target allocation across strategies:

| Bucket | Target % | Purpose |
|--------|----------|---------|
| Trading (arb + thesis) | 50% | Active positions in prediction markets |
| Yield | 30% | Deployed to Venus Protocol for passive APY |
| Reserve | 20% | Undeployed stablecoins for sudden opportunities |

### Rebalancing Rules

- After closing a trade, returned capital goes to reserve first.
- If reserve exceeds 25%, deploy excess to yield.
- Before opening a new trade, recall from yield if trading bucket is under-allocated.
- Never deploy reserve to yield — reserve is for emergency trades and gas.

## Conflict Resolution

When multiple strategies signal at the same time:

1. **Arb wins.** If an arb opportunity is live, execute it before anything else. Arb edges decay in minutes.
2. **Thesis next.** If no arb, execute thesis trades. Thesis edges decay over hours/days.
3. **Yield last.** Yield is always available. Deploy only after active strategies are satisfied.

If a thesis trade requires recalling capital from yield, recall first, then execute the trade. See `strategy-yield.md` for recall mechanics.

## Heartbeat Schedule

| Check | Frequency |
|-------|-----------|
| Arb scan | Every heartbeat (30 min) |
| Thesis re-analysis | Weekly |
| Yield status | Every heartbeat (30 min) |
| Position health | Every heartbeat (30 min) |
| Stop-loss check | Every heartbeat (30 min) |

## API Base

All endpoints use the base URL: `https://eyebalz.xyz/api/v1`

## Related Strategies

- [Delta-Neutral Arbitrage](strategy-delta-neutral.md) — cross-platform arb execution
- [Thesis-Driven Trading](strategy-thesis.md) — conviction-based directional trades
- [Yield Optimization](strategy-yield.md) — idle capital deployment to Venus Protocol
