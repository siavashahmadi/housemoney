# Game Logic Reference

Complete reference for the blackjack game's state machine, debt mechanics, betting flow, and known edge cases. This is the source of truth for how the game works — read this before touching game logic code.

---

## State Machine

```
                          DEAL (blackjack/push)
                     ┌───────────────────────────────┐
                     │                               │
                     v                               │
┌─────────┐      DEAL       ┌─────────┐         ┌────────┐
│ BETTING │ ──────────────> │ PLAYING │         │ RESULT │
└─────────┘  (4 cards dealt)└─────────┘         └────────┘
     ^                           │                   ^
     │                           │ HIT/STAND/        │
     │                           │ DOUBLE/SPLIT      │
     │                           v                   │
     │                    ┌────────────┐             │
     │                    │ DEALER     │  RESOLVE    │
     │                    │ TURN       │─────────────┘
     │                    └────────────┘
     │                           │
     │                    (all bust)─────────────────┘
     │                                               │
     └───────── NEW_ROUND ───────────────────────────┘
```

### Phase Transitions

| From | To | Trigger | Condition |
|------|----|---------|-----------|
| betting | playing | DEAL | chips + assets >= minBet, 4 cards |
| betting | result | DEAL | Natural blackjack or dealer blackjack |
| playing | playing | HIT | Hand value < 21, more hands to play |
| playing | playing | HIT (21) | Auto-stand on 21, advance to next hand |
| playing | dealerTurn | STAND/HIT(bust)/DOUBLE/SPLIT | All hands done, at least one not bust |
| playing | result | HIT/DOUBLE/SPLIT | All hands busted |
| dealerTurn | dealerTurn | DEALER_DRAW | Dealer value < 17, or soft 17 |
| dealerTurn | result | RESOLVE_HAND | Dealer stands (hard 17+) |
| result | betting | NEW_ROUND | chipStack empty (resolved) |

### Timing

- **DEALER_HIT_DELAY**: 600ms between dealer draws
- **DEALER_STAND_DELAY**: 400ms before resolving after dealer stands
- **Natural BJ resolution**: 300ms delay (DEAL sets phase=result, useDealerTurn dispatches RESOLVE_HAND)
- **Loan shark messages**: 1500ms delay after bankroll threshold crossed

---

## The Money Pipeline

This is how money flows through the game, from first bet to resolution.

### Betting Phase

```
Player has bankroll >= minBet?
├── YES: Chip tray enabled. Tap chips to build chipStack array.
│        Each chip ADD_CHIP appends to chipStack.
│        ALL_IN decomposes bankroll into chips.
│        Cap: total chips <= bankroll (unless inDebtMode).
│
└── NO (bankroll < minBet):
    Chip tray BLOCKED. Player enters the Debt Gate Pipeline:

    Any owned asset unlocked at this bankroll?
    ├── YES: Asset Gate overlay → "BET AN ASSET"
    │        Player bets asset → value added to bet total
    │        Losing = asset gone forever
    │
    └── NO: Loan Gate overlay → "TAKE A LOAN"
            Player takes loan → inDebtMode = true
            Chip tray unlocks permanently (until bankroll recovers)
            ALL_IN in debt mode → bet = minBet (minimum borrowed amount)
```

### Vig (Interest on Borrowed Money)

Vig is charged at three points, always on the borrowed portion only:

**1. DEAL** — On the initial bet
```
borrowedAmount = max(0, betAmount - max(0, bankroll))
vigAmount = floor(borrowedAmount * vigRate)
bankroll -= vigAmount    // charged immediately
```

**2. DOUBLE_DOWN** — On the additional bet (= original hand.bet)
```
otherHandsBets = sum of all other hands' bets
effectiveBankroll = max(0, bankroll - otherHandsBets)
borrowedAmount = max(0, hand.bet - effectiveBankroll)
vigAmount = floor(borrowedAmount * vigRate)
bankroll -= vigAmount
```

**3. SPLIT** — On the new hand's bet (= original hand.bet)
```
(Same calculation as DOUBLE_DOWN)
```

### Vig Rate Tiers

| Bankroll Range | Rate |
|----------------|------|
| >= $0 | 2% |
| -$10K to $0 | 4% |
| -$50K to -$10K | 7% |
| -$250K to -$50K | 10% |
| -$500K to -$250K | 15% |
| -$1M to -$500K | 20% |
| -$5M to -$1M | 27.5% |
| Below -$5M | 40% |

### Resolution (RESOLVE_HAND)

```
For each hand:
  blackjack → +1.5x handBet
  win/dealerBust → +1x handBet
  push → 0
  lose/bust → -1x handBet

Assets apply to hand[0] ONLY:
  hand[0] wins/pushes → assets returned to player
  hand[0] loses/busts → assets lost permanently

bankroll += totalDelta
chipStack = [] (cleared)
bettedAssets = [] (cleared)

Exit debt mode if: bankroll >= minBet of new table level
```

---

## Debt Gate Pipeline (Detailed)

This is the core comedy mechanic. The player can never truly go broke — they spiral deeper.

### Asset Unlock Thresholds

| Asset | Unlock At | Value | Notes |
|-------|-----------|-------|-------|
| Watch | bankroll <= $0 | $500 | First desperate measure |
| Jewelry | bankroll <= -$500 | $2,000 | |
| Car (Tesla Model 3) | bankroll <= -$2,000 | $35,000 | |
| Kidney | bankroll <= -$10,000 | $50,000 | |
| House | bankroll <= -$30,000 | $250,000 | Requires confirmation |
| Soul | bankroll <= -$200,000 | $666,666 | Requires confirmation |

### Gate Decision Logic

```
bankroll >= minBet? → Normal play (chip tray enabled)
                 │
                 NO
                 │
                 v
Any asset where (bankroll <= threshold) AND (owned OR betted)?
├── YES → Show "BET AN ASSET" gate
│         Player must bet an asset before chips unlock
│
└── NO → Show "TAKE A LOAN" gate
          Player takes loan → inDebtMode = true
          Chip tray unlocks, all bets use borrowed money
          Vig charged on every borrowed dollar
```

### Debt Mode Lifecycle

```
ENTER: Player clicks "TAKE A LOAN"
  - Conditions: bankroll < minBet, no unlockable assets available
  - Sets inDebtMode = true
  - Chip tray unlocks
  - "BORROWED" label appears on chip tray
  - Debt chip sets escalate with debt depth

ACTIVE: Player bets freely with borrowed money
  - ADD_CHIP: no bankroll cap (can bet any amount)
  - ALL_IN: decomposes to minBet (can't go "all in" on negative)
  - DOUBLE_DOWN: debt gate bypassed
  - SPLIT: always allowed (no debt gate on split — see Known Issues)
  - Vig charged on every bet/double/split

EXIT: RESOLVE_HAND detects bankroll >= minBet
  - Sets inDebtMode = false automatically
  - Player returns to normal betting
  - If bankroll drops below minBet again, must re-enter debt pipeline
```

### Debt Chip Escalation

When bankroll <= 0 and in debt mode, chip denominations scale with debt:

| Debt Range | Available Chips |
|------------|----------------|
| $0 to -$100K | $100, $500, $1K, $5K, $25K |
| -$100K to -$1M | $1K, $5K, $25K, $100K, $500K |
| Below -$1M | $5K, $25K, $100K, $500K, $1M |

---

## Split Mechanics

- **Condition**: Two cards of same rank (K-K yes, K-Q no)
- **Max hands**: 4 (can split up to 3 times)
- **Bet duplication**: Each new hand gets the same bet as the original
- **Aces special**: Split aces get exactly 1 card each, auto-stand, can't re-split
- **Vig**: Charged on the new hand's bet (borrowed portion)
- **Assets**: Tied to hand[0] only. If hand[0] loses, assets lost even if other hands win.

### Split + Double Interaction

After splitting, each non-ace hand can be doubled down on (2 cards, not already doubled). Both vig calculations use the bankroll AT THE TIME of the action, not the original bankroll.

---

## Table Level System

| Level | Name | Unlock At | Min Bet | Max Bet | Chips |
|-------|------|-----------|---------|---------|-------|
| 0 | The Felt | $0 | $25 | $5K | 25, 100, 500, 1K, 5K |
| 1 | Emerald Room | $100K | $500 | $25K | 100, 500, 1K, 5K, 25K |
| 2 | High Roller | $500K | $1K | $100K | 500, 1K, 5K, 25K, 100K |
| 3 | Penthouse | $2M | $10K | $500K | 1K, 5K, 25K, 100K, 500K |
| 4 | The Vault | $5M | $100K | $5M | 5K, 25K, 100K, 500K, 1M |
| 5 | Obsidian Room | $10M | $1M | $10M | 25K, 100K, 500K, 1M, 10M |

- Bankroll <= $0 always returns to The Felt (level 0)
- Table level recalculated on RESOLVE_HAND
- selectedChipValue auto-corrects if invalid at new level
- Level changes show a toast notification

---

## All Guard Conditions (Reducer)

Every action that can be blocked, and exactly what blocks it.

### ADD_CHIP
```
phase !== 'betting'                              → blocked
bankroll < minBet && !inDebtMode                 → blocked (debt gate)
chipTotal + newChip > bankroll && !inDebtMode     → blocked (bet cap)
```

### ALL_IN
```
phase !== 'betting'                              → blocked
bankroll < minBet && !inDebtMode                 → blocked (debt gate)
If bankroll < minBet (in debt): chipStack = decompose(minBet)
If bankroll >= minBet: chipStack = decompose(bankroll)
```

### DEAL
```
phase !== 'betting'                              → blocked
chipTotal + assetValue < minBet                  → blocked
action.cards.length !== 4                        → blocked
```

### HIT
```
phase !== 'playing'                              → blocked
!action.card                                     → blocked (empty deck guard)
hand.isDoubledDown                               → blocked
hand.isSplitAces                                 → blocked
```

### DOUBLE_DOWN
```
phase !== 'playing'                              → blocked
!action.card                                     → blocked (empty deck guard)
hand.cards.length !== 2                          → blocked
hand.isSplitAces                                 → blocked
bankroll - hand.bet < 0 && !inDebtMode           → blocked (debt gate)
```

### SPLIT
```
phase !== 'playing'                              → blocked
playerHands.length >= 4                          → blocked (max hands)
action.cards.length !== 2                        → blocked
hand.cards.length !== 2                          → blocked
cards[0].rank !== cards[1].rank                  → blocked (must match)
hand.isSplitAces                                 → blocked (no re-split aces)
bankroll - hand.bet < 0 && !inDebtMode           → blocked (debt gate)
```

When split/double is blocked by debt gate, the UI shows a loan confirmation modal.
Player can accept (takes loan, action proceeds) or cancel.

### TAKE_LOAN
```
phase !== 'betting' && phase !== 'playing'       → blocked
bankroll >= minBet                               → blocked (not broke enough)
(betting phase only) any asset unlocked AND (owned OR betted) → blocked (must bet assets first)
```

During playing phase, TAKE_LOAN skips the asset check — it's triggered by the loan
confirmation modal when a player tries to split/double but can't afford it.

### NEW_ROUND
```
phase !== 'result'                               → blocked
chipStack.length > 0                             → blocked (not yet resolved)
```

### RESOLVE_HAND
```
phase === 'result' && chipStack.length === 0     → blocked (double-dispatch guard)
```

---

## Hook Side Effects

Six hooks manage async behavior. They fire in definition order per React guarantees.

### useDealerTurn
- **Effect 1 (dealer draws)**: phase=dealerTurn → draw cards at 600ms intervals, resolve at 400ms after standing
- **Effect 2 (natural BJ)**: phase=result + chipStack not empty → dispatch RESOLVE_HAND after 300ms
- Double dispatch prevented by reducer guard + mutually exclusive phases

### useDealerMessage
- 7 independent effects, all fire synchronously (no delays)
- Triggers: greeting, deal, resolve, asset bet, split, debt activated, table change, reset

### useLoanShark
- Watches bankroll decreases below $0
- Checks against thresholds: -$1K, -$5K, -$10K, -$25K, -$50K, -$100K, -$250K, -$500K, -$1M
- 1500ms delay before showing (so result banner appears first)
- Messages accumulate across rapid bankroll drops via pendingRef, then dispatch all at once

### useAchievements
- Triggers on handsPlayed increment (most checks), inDebtMode change, mount
- Reads prevState via ref for before/after comparison
- Persists to localStorage

### useSound
- Fires on every state change (broad dependency)
- Internal conditions prevent duplicate sounds
- Deal: 4x card_deal at 150ms intervals

### useSessionPersistence
- Persists: muted, notifications, highest debt
- loadedRef guard prevents infinite save-load loops

---

## Known Issues & Edge Cases

### FIXED: Deck Exhaustion — Mid-Round Reshuffle
~~Previously hung the game~~ — now `useDealerTurn` dispatches `dealerDraw(null, freshDeck)` when deck is empty. The DEALER_DRAW reducer detects `!action.card && action.freshDeck` and replaces the deck, then draws from it. A "Reshuffling..." indicator briefly appears in the DealerArea.

### FIXED: Split/Double Debt Gate — Loan Confirmation Modal
~~Split had no debt gate; double silently failed~~ — now both SPLIT and DOUBLE_DOWN have matching debt gates (`bankroll - hand.bet < 0 && !inDebtMode`). When triggered, SoloGame shows a loan confirmation modal ("The house charges interest on every borrowed dollar"). Confirming dispatches TAKE_LOAN then the original action. TAKE_LOAN now also works during `playing` phase (skips asset check).

### FIXED: Loan Shark Message Accumulation
~~Messages lost on rapid losses~~ — `useLoanShark` now accumulates messages in a `pendingRef` across rapid bankroll drops. The 1500ms timer resets on each drop, but all accumulated messages dispatch together when it fires.

### EDGE CASE: Assets Tied to Hand[0] After Split
**Severity: LOW (design decision)**

Asset payout is determined solely by hand[0]'s result. If hand[0] loses but hand[1] wins, assets are lost even though the player profited overall. This is harsh but arguably correct for a game designed to maximize the comedy of loss.

### EDGE CASE: REMOVE_ASSET Allowed During Playing Phase
**Severity: LOW**

The reducer allows `REMOVE_ASSET` during `phase === 'playing'`, but the UI never renders the asset betting controls during play. The reducer gate is wider than the UI gate. Not exploitable through normal interaction but could be via console dispatch.

### EDGE CASE: Vig Uses Stale Bankroll for Rate
**Severity: LOW**

When a player splits twice then doubles, each vig calculation uses `state.bankroll` at the time of the action. After split #1 charges vig, bankroll decreases, but split #2's rate lookup still sees the pre-vig bankroll from the same render. In practice, the difference is negligible since vig amounts are floored integers.

---

## Walkthrough: Complete Debt Spiral

Here's the full journey from rich to "betting your soul":

```
$10,000  Normal play. Bet chips, win/lose, table level stays at The Felt.
         ↓ (losing streak)
$24      Bankroll < $25 minBet. Chip tray blocked.
         No assets unlocked yet (watch needs bankroll <= $0).
         LOAN GATE appears → player takes loan → inDebtMode = true.
         ↓ (keeps losing with borrowed money)
$0       Watch unlocks (threshold $0). But player is already in debt mode.
         If they win back above $25, debt mode exits. If they lose more...
         ↓
-$500    Jewelry unlocks ($2,000 value). If debt mode was exited,
         player would see ASSET GATE → bet jewelry.
         ↓
-$2,000  Car unlocks ($35,000 value). Loan sharks start messaging.
         ↓
-$10,000 Kidney unlocks ($50,000). Vig rate hits 4%.
         ↓
-$30,000 House unlocks ($250,000). Requires confirmation to bet.
         ↓
-$200,000 Soul unlocks ($666,666). Final asset. Vig rate 10%.
          ↓
-$666,666+ All assets lost. Only option: TAKE A LOAN (again).
           Vig rate escalates. Chip denominations escalate.
           Player bets millions of borrowed money.
           Loan sharks send increasingly threatening messages.
           ↓
-$5,000,000+ Vig rate hits 40%. Debt chips go up to $1M each.
             The comedy is that you literally cannot stop playing.
```

### Key Transition Points

| Bankroll | What Happens | Player Must |
|----------|-------------|-------------|
| $25+ | Normal play | Bet chips |
| $1-$24 | Below min bet, no assets unlocked | Take a loan |
| $0 | Watch unlocks | Bet watch (or take loan if watch lost) |
| -$500 | Jewelry unlocks | Bet jewelry or take loan |
| -$2,000 | Car unlocks, sharks start | Bet car or take loan |
| -$10,000 | Kidney unlocks, vig 4% | Bet kidney or take loan |
| -$30,000 | House unlocks | Bet house (with confirmation) or loan |
| -$200,000 | Soul unlocks, vig 10% | Bet soul (with confirmation) or loan |
| Below -$200K | All assets exhausted | Take loan, play forever |

---

## chipStack Lifecycle

The chipStack array is the bridge between betting and resolution.

```
BETTING PHASE:
  ADD_CHIP  → chipStack = [...chipStack, value]
  UNDO_CHIP → chipStack = chipStack.slice(0, -1)
  CLEAR_CHIPS → chipStack = []
  ALL_IN    → chipStack = decompose(bankroll or minBet)

DEAL:
  betAmount = sum(chipStack)    // read once, used for hand.bet
  chipStack survives into playing phase (displayed in BettingCircle)

PLAYING / DEALER_TURN:
  chipStack unchanged (still displayed)

RESOLVE_HAND:
  chipStack = []                // cleared after payout calculated

NEW_ROUND:
  chipStack = []                // confirmed empty
```

### Why chipStack persists through playing phase
The BettingCircle needs the chip values for visual display during play. The 300ms natural blackjack window also uses `chipStack.length > 0` as a guard to know RESOLVE_HAND hasn't fired yet.

---

## ResultBanner Rendering

Two separate ResultBanner instances exist:

1. **Display-only** (in table area): Shows result text during the 300ms window before RESOLVE_HAND
   - Condition: `phase === 'result' && result !== null`
   - No "Next Hand" button

2. **Interactive** (in controls area): Shows result + payout + "Next Hand" button
   - Condition: `phase === 'result' && chipStack.length === 0`
   - Only appears AFTER RESOLVE_HAND clears chipStack
   - "Next Hand" button text varies with bankroll depth
