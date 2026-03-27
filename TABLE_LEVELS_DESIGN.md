# Table Levels — Phase 3 Design Spec

Future feature spec for tiered table progression. No implementation code — design only.

## Table Tiers

| Table | Min Bet | Max Bet | Felt Color | Vibe |
|-------|---------|---------|------------|------|
| The Lounge | $25 | $5,000 | Classic green | Casual, warm lighting |
| High Roller | $100 | $25,000 | Deep emerald | Upscale, brass accents |
| The Penthouse | $500 | $100,000 | Midnight blue | Exclusive, cold lighting |
| The Vault | $5,000 | $1,000,000 | Black with gold trim | Underground, ominous |

## Chip Denominations per Table

| Table | Chips |
|-------|-------|
| The Lounge | $25, $100, $500, $1K, $5K |
| High Roller | $100, $500, $1K, $5K, $25K |
| The Penthouse | $500, $1K, $5K, $25K, $100K |
| The Vault | $5K, $25K, $100K, $500K, $1M |

## Unlock Progression

Tables unlock based on player milestones (any one condition unlocks):

| Table | Hands Played | Peak Bankroll | Assets Sold |
|-------|-------------|--------------|-------------|
| The Lounge | 0 (default) | — | — |
| High Roller | 50 hands | $50,000 | 1 asset |
| The Penthouse | 150 hands | $250,000 | 3 assets |
| The Vault | 500 hands | $1,000,000 | All 6 assets |

## Dealer Personalities

Each table could have a distinct dealer personality:

- **The Lounge** — Friendly, encouraging, tutorial-ish. "Hey, nice hit! You're getting the hang of this."
- **High Roller** — Sardonic, dry humor. "Bold move. Let's see if the cards agree."
- **The Penthouse** — Cold, professional, barely acknowledges the player. "Hmm."
- **The Vault** — Menacing, knows too much about the player. "Your mother called again. We didn't answer."

## Vig Rates per Table

Higher tables could have steeper vig rates, rewarding the risk:

| Table | Base Vig | Max Vig |
|-------|----------|---------|
| The Lounge | 2% | 20% |
| High Roller | 3% | 25% |
| The Penthouse | 5% | 30% |
| The Vault | 8% | 40% |

## Multiplayer Integration

- Multiplayer rooms are tied to a table level
- All players at the same table share the min/max bet and chip set
- Room browser shows table tier, current players, and minimum bankroll to join
- Spectators can watch higher-tier tables without meeting unlock requirements

## Debt/Asset System Interaction

Open questions for implementation:

- **Do asset values scale with table tier?** Selling a watch at The Vault could be worth more than at The Lounge (reflecting the "everything costs more" feel of high-stakes tables).
- **Do loan shark thresholds scale?** At The Vault, the -$1,000 message might not trigger until -$100,000.
- **Can players drop down to lower tables?** If you're in massive debt at The Vault, can you retreat to The Lounge to recover with smaller bets? Or is that locked once you've "moved up"?
- **Table-specific achievements?** "Penthouse Regular" (play 100 hands at The Penthouse), "Vault Dweller" (survive 50 hands at The Vault).
