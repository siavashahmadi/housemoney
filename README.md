# Blackjack: Unlimited Debt Edition

A mobile-first blackjack game where you can never go broke — the casino extends unlimited credit, letting you spiral into fictional debt by betting your watch, car, house, kidney, and immortal soul. A sarcastic AI dealer trash-talks your every decision while loan sharks send increasingly threatening messages.

**Live at:** [blackjack.siaahmadi.com](https://blackjack.siaahmadi.com)

## Features

- **Unlimited debt mechanic** — Bankroll goes negative with no floor. Bet $500K when you're already $1M in debt. The casino doesn't care.
- **Asset betting** — When broke enough, bet physical possessions: watch ($500) → jewelry ($2K) → Tesla ($35K) → kidney ($50K) → house ($250K) → soul ($666,666). Lost assets are gone for the session.
- **Chip stacking** — Tap casino chips ($25 to $25K) that animate into a betting circle. No text input — pure casino feel.
- **Dealer trash talk** — 12+ categories of pre-written sarcastic commentary triggered by game events (bust, blackjack, losing streak, betting your kidney).
- **Loan shark messages** — 11 escalating threat popups at debt milestones from -$1K to -$10M.
- **Achievement system** — 26 achievements tracking milestones, streaks, and absurd behavior. Persisted to localStorage.
- **Synthesized sound effects** — Web Audio API generates chip, card, win/lose sounds. No .mp3 files.
- **Session persistence** — Achievements, mute preference, and highest debt survive page reload.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + Vite 8 |
| State | `useReducer` (single pure reducer, no external libs) |
| Styling | CSS Modules + CSS Variables (no Tailwind, no component libs) |
| Audio | Web Audio API (synthesized, no audio files) |
| Fonts | Playfair Display (headings), DM Sans (body), JetBrains Mono (money) |
| Deploy | Docker + nginx, Cloudflare SSL |
| Dependencies | **Zero** runtime deps beyond React + ReactDOM |

## Architecture

### Component Tree

```
App
├── Header                    # Logo, achievement count, mute toggle, reset
├── BankrollDisplay           # Bankroll amount with debt animations
├── Table
│   ├── DealerArea            # "DEALER" label, speech bubble, cards, hand value
│   │   └── DealerSpeechBubble
│   ├── BettingCircle         # Circular bet spot with stacked chips
│   └── PlayerArea            # Player cards, hand value
├── Controls (phase-dependent)
│   ├── BettingControls       # ChipTray + UNDO/CLEAR/ALL IN + AssetBetting + DEAL
│   ├── ActionButtons         # HIT / STAND / DOUBLE DOWN
│   ├── "Dealer's turn..."    # Waiting text
│   └── ResultBanner          # WIN/LOSE/BUST + NEXT HAND
├── LoanSharkPopup            # Debt milestone overlay
├── AchievementToast          # Unlock notification
└── AchievementPanel          # Full achievement list overlay
```

### Game Phase State Machine

```
                    ┌─────────────────────────────────┐
                    │                                 │
                    ▼                                 │
              ┌──────────┐    DEAL    ┌──────────┐    │
              │ BETTING  │──────────▶│ PLAYING  │    │
              └──────────┘           └──────────┘    │
                    ▲                     │           │
                    │              HIT (bust)──▶ RESULT
                    │              STAND  │           │
                    │                     ▼           │
              ┌──────────┐         ┌───────────┐     │
              │  RESULT  │◀────────│DEALER TURN│     │
              └──────────┘         └───────────┘     │
                    │                                 │
                    │          NEW ROUND              │
                    └─────────────────────────────────┘
```

**Transitions:**
- `betting` → `playing`: DEAL dispatched with 4 cards. Auto-resolves if either hand is blackjack.
- `playing` → `dealerTurn`: Player STANDs or DOUBLE_DOWNs (without bust).
- `playing` → `result`: Player busts (hand > 21).
- `dealerTurn` → `result`: Dealer finishes drawing (hits soft 17, stands hard 17+). Outcome resolved.
- `result` → `betting`: NEW_ROUND dispatched. Deck reshuffled if < 20 cards remain.

### Data Flow

```
User Event (tap chip, hit, stand)
         │
         ▼
  App.jsx handler (useCallback)
         │
         ├── Direct sound (chip tap → audioManager.play)
         │
         ▼
  dispatch(action)  ◀── Cards drawn from deck via stateRef
         │
         ▼
  gameReducer (PURE — no side effects, no randomness)
         │
         ▼
  New state → React re-render
         │
         ├── useDealerTurn: auto-draws dealer cards, resolves hand
         ├── useDealerMessage: selects trash talk line
         ├── useLoanShark: checks debt thresholds
         ├── useAchievements: checks unlock conditions
         ├── useSound: plays transition sounds
         └── useSessionPersistence: syncs to localStorage
```

**Key design decision:** The reducer is pure. Randomness (card draws) happens in the component via `stateRef.current.deck.slice()` and is passed to the reducer via action payloads. This keeps the reducer deterministic and testable.

### State Shape

```javascript
{
  // Deck — 6-deck shoe (312 cards), reshuffled at <20 remaining
  deck: [{ rank: 'A', suit: '♠', id: '♠-A-0' }, ...],

  // Hands
  playerHand: [],           // Array of card objects
  dealerHand: [],           // Array of card objects

  // Money
  bankroll: 10000,          // Can go negative (core mechanic)
  currentBet: 0,            // Locked in on DEAL (sum of chipStack)
  chipStack: [],            // [100, 100, 500] = $700 bet (array, not number)
  selectedChipValue: 100,   // Last tapped chip denomination

  // Assets
  ownedAssets: { watch: true, jewelry: true, ... },  // Per-session ownership
  bettedAssets: [],         // Assets wagered on current hand

  // Game flow
  phase: 'betting',         // 'betting' | 'playing' | 'dealerTurn' | 'result'
  result: null,             // null | 'win' | 'lose' | 'bust' | 'blackjack' | 'push' | 'dealerBust'
  isDoubledDown: false,     // Double down auto-stands (one card only)
  isAllIn: false,           // Tracks if player went all-in this hand

  // Dealer
  dealerMessage: '',        // Current trash talk line

  // Stats
  handsPlayed: 0,
  winStreak: 0,   loseStreak: 0,
  totalWon: 0,    totalLost: 0,
  peakBankroll: 10000,      // Highest bankroll reached
  lowestBankroll: 10000,    // Deepest debt reached

  // Systems
  unlockedAchievements: [], // Achievement IDs
  seenLoanThresholds: [],   // Debt thresholds already triggered
  shownDealerLines: {},     // { category: [indices] } — no-repeat tracking

  // UI
  showAssetMenu: false,
  showAchievements: false,
  achievementQueue: [],     // Pending toast notifications
  loanSharkQueue: [],       // Pending loan shark popups
  muted: false,
}
```

## Game Rules

- **6-deck shoe**, reshuffled when fewer than 20 cards remain (checked before dealing, not mid-hand)
- **Dealer hits on soft 17** (A+6 = 17 with ace as 11). Stands on hard 17+.
- **Blackjack pays 3:2** ($100 bet → $150 profit)
- **Double down**: Doubles bet, one card, auto-stand. Available on first two cards only.
- **No splits, no insurance, no surrender** (Phase 1)
- **No bet cap**: Stack unlimited chips. -$500K bankroll? Bet another $500K. The casino extends infinite credit.

## Comedy Mechanics

### Debt Spiral
The player starts with $10,000. When bankroll hits $0, the game doesn't end — the casino extends unlimited credit. The bankroll goes negative. UI reactions escalate:

| Bankroll | Visual Effect |
|----------|--------------|
| > $0 | Gold color, no animation |
| = $0 | Red, single pulse |
| < $0 | Red, gentle pulse glow |
| < -$10K | Red, stronger pulse + DEAL button wobble |
| < -$50K | Red, pulse + shake on bankroll number |
| < -$100K | Red, aggressive pulse + hard shake |

### Asset Betting
Assets unlock progressively as debt deepens:

| Asset | Value | Unlocks At |
|-------|-------|-----------|
| Watch ⌚ | $500 | $0 |
| Jewelry 💍 | $2,000 | -$500 |
| Tesla 🚗 | $35,000 | -$2,000 |
| Kidney 🫘 | $50,000 | -$10,000 |
| House 🏠 | $250,000 | -$30,000 |
| Soul 👻 | $666,666 | -$200,000 |

Win → asset returned + cash value won. Lose → asset gone permanently. Push → asset returned.

### Dealer Trash Talk
12+ categories with 8-12 pre-written lines each. Tracks shown indices per category to avoid repeats until all lines are exhausted. Categories: `greeting`, `playerBust`, `playerLose`, `playerBroke`, `playerDebt`, `assetBet`, `playerWin`, `playerBlackjack`, `bigBet`, `doubleDownLoss`, `winStreak`, `loseStreak`, `assetLost`, `deepDebt`.

### Loan Shark Messages
11 debt thresholds from -$1K to -$10M. Each triggers once per session with a dramatic popup. Examples: "Someone named Vinnie called. He says you know what this is about." (-$5K), "Your credit score just caught fire." (-$500K).

### Chip System

| Value | Color | Unlocks |
|-------|-------|---------|
| $25 | Green | Always |
| $100 | Black | Always |
| $500 | Purple | Always |
| $1,000 | Orange | Always |
| $5,000 | Red | Always |
| $25,000 | Cyan | At -$5K debt |

## Project Structure

```
src/
├── main.jsx                           # Entry point
├── App.jsx                            # Root component, hooks wiring, handlers
├── App.module.css                     # App layout (fixed-height controls area)
├── reducer/
│   ├── gameReducer.js                 # Pure state machine — 26 action types
│   ├── initialState.js                # State factory ($10K bankroll, fresh deck)
│   └── actions.js                     # Action type constants + creators
├── hooks/
│   ├── useDealerTurn.js               # Dealer card draws + hand resolution
│   ├── useDealerMessage.js            # Trash talk line selection + dispatch
│   ├── useAchievements.js             # Achievement checks + localStorage sync
│   ├── useLoanShark.js                # Debt threshold monitoring
│   ├── useSound.js                    # Sound triggers on state transitions
│   └── useSessionPersistence.js       # Mute pref + highest debt persistence
├── components/
│   ├── Card.jsx / .module.css         # Single playing card (rank, suit, face-down)
│   ├── Hand.jsx / .module.css         # Fanned hand with dynamic overlap
│   ├── DealerArea.jsx / .module.css   # Dealer hand + speech bubble + value
│   ├── PlayerArea.jsx / .module.css   # Player hand + value
│   ├── DealerSpeechBubble.jsx / .css  # Animated trash talk bubble
│   ├── BettingCircle.jsx / .module.css# Circular bet spot with chip stacks
│   ├── Chip.jsx / .module.css         # Casino chip (tray + stack sizes)
│   ├── ChipTray.jsx / .module.css     # Horizontal row of tappable chips
│   ├── BettingControls.jsx / .css     # ChipTray + buttons + assets + DEAL
│   ├── AssetBetting.jsx / .module.css # Expandable asset menu (overlays upward)
│   ├── ActionButtons.jsx / .module.css# HIT / STAND / DOUBLE DOWN
│   ├── ResultBanner.jsx / .module.css # Result text + NEXT HAND button
│   ├── Header.jsx / .module.css       # Logo, achievements, mute, reset
│   ├── BankrollDisplay.jsx / .css     # Bankroll with debt tier animations
│   ├── LoanSharkPopup.jsx / .css      # Debt milestone popup overlay
│   ├── AchievementToast.jsx / .css    # Achievement unlock notification
│   └── AchievementPanel.jsx / .css    # Full achievement list overlay
├── constants/
│   ├── gameConfig.js                  # STARTING_BANKROLL, MIN_BET, DECK_COUNT, etc.
│   ├── cards.js                       # SUITS, RANKS, SUIT_SYMBOLS, SUIT_COLORS
│   ├── chips.js                       # 6 denominations with colors + thresholds
│   ├── assets.js                      # 6 assets with values + unlock thresholds
│   ├── achievements.js                # 26 achievement definitions
│   ├── dealerLines.js                 # All trash talk lines by category
│   └── loanSharkMessages.js           # 11 debt milestone messages
├── utils/
│   ├── cardUtils.js                   # createDeck, shuffle, handValue, isSoft, isBlackjack
│   ├── dealerMessages.js              # selectDealerLine, determineDealerCategory
│   ├── formatters.js                  # formatMoney
│   └── audioManager.js               # Web Audio API sound synthesis
└── styles/
    ├── theme.css                      # CSS variables, felt texture, base reset
    └── animations.css                 # @keyframes for cards, chips, toasts
```

## Development

```bash
npm install          # Install dependencies (React + Vite only)
npm run dev          # Start Vite dev server (localhost:5173)
npm run build        # Production build → dist/
npm run lint         # ESLint
npm run preview      # Preview production build locally
```

## Deployment

Self-hosted on Ubuntu via Docker behind Nginx Proxy Manager.

```
Internet → Cloudflare (SSL) → Nginx Proxy Manager → Docker (port 3021) → nginx → dist/
```

```bash
# Build and run
docker compose up -d --build

# Or manually
docker build -t blackjack .
docker run -p 3021:80 blackjack
```

**Docker setup:**
- Multi-stage build: Node 20 (build) → nginx alpine (serve)
- nginx config: SPA routing, gzip, 1-year cache on `/assets/`
- Domain: `blackjack.siaahmadi.com`
- SSL: Cloudflare origin certificate

## Design System

### Felt Background
Three CSS layers simulating casino green felt:
1. **Radial gradient** — lighter center (spotlight), darker edges
2. **SVG noise texture** — `feTurbulence` filter at 12% opacity for grain
3. **Dark green base** — `#0c200c`

### Color Palette
```
Felt:    #0c200c (dark) → #143a14 (mid) → #1a5a1a (light) → #2a7a2a (highlight)
Gold:    #f0c850 (primary), #d4a832 (dim)
Cards:   #f5f0e8 (white), #cc3333 (red suits), #1a1a2e (black suits)
Danger:  #e74c3c
Success: #27ae60
Text:    #e8e0d0 (primary), rgba(232,224,208,0.5) (dim)
```

### Typography
- **Playfair Display 900** — Headings, DEAL button, result text
- **DM Sans 400/500/700** — Body text, buttons, labels
- **JetBrains Mono 500/700** — Bankroll numbers, bet totals, chip values
