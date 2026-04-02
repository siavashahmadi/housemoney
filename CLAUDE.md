# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mobile-first blackjack web app with a dark casino green felt aesthetic. Core comedy mechanic: the player can never go broke — when bankroll hits $0, the casino extends unlimited credit, allowing the player to spiral into fictional debt (betting their watch, car, house, kidney, soul). Dealer trash-talks throughout, loan sharks send threatening messages, and achievements reward absurd behavior.

Read `ARCHITECTURE.md` for the full technical reference (state shapes, action catalog, protocol). Read `GAME_LOGIC.md` for the state machine, debt mechanics, betting flow, and edge cases.

## Build & Dev Commands

```bash
npm install          # install dependencies
npm run dev          # start Vite dev server (port 5173)
npm run build        # production build to dist/
npm run lint         # ESLint check
npm run preview      # preview production build locally

# Backend (Phase 2)
cd server
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000

# Server tests
cd server
python -m unittest discover
```

## Tech Stack & Constraints

- **React 19 with Vite 8** — no Next.js, no Astro. Minimal vite.config (just `react()` plugin).
- **No Tailwind, no component libraries** (no MUI, no shadcn) — CSS variables in `theme.css` + CSS Modules (`.module.css`) for component-scoped styles. NOT inline style objects. Every component has a matching `.module.css` file.
- **No external state management** (no Redux, no Zustand) — `useReducer` for ALL game state. `useState` only for local component UI concerns (animation triggers, transient visual states).
- **Fonts:** Playfair Display (headings), DM Sans (body), Outfit (numbers/money) via Google Fonts.
- **Dependencies:** Only `react` and `react-dom`. Everything else (ESLint, Vite, types) is devDependencies.
- **Phase 2 backend:** Python FastAPI with native WebSocket support (not Socket.IO).

## Architecture

### State Management

All game state flows through a single `useReducer` in `SoloGame.jsx`. This is intentional — the original app had race condition bugs from scattered `useState` calls. The reducer must be **pure**: no `Math.random()` inside it. Pass randomness (drawn cards) via action payloads.

`App.jsx` is a thin router between `ModeSelect`, `SoloGame`, and multiplayer (`Lobby` / `MultiplayerGame`). The solo reducer lives in `SoloGame`, not `App`.

Betting uses a **chip-stacking system** — players tap chips that animate into a betting circle on the table. Bets are tracked as an array of chip values (`chipStack: [100, 100, 500]` = $700), not a single number. `DEAL` sums the `chipStack` into `currentBet`. Always sum via `chipStack.reduce((s, v) => s + v, 0)` — never compare chipStack length to bet amount.

The dealer turn is animated outside the reducer via a `useDealerTurn` hook that dispatches `DEALER_DRAW` actions sequentially (600ms apart). Dealer hits on **soft 17** (A+6) — use the `isSoft()` helper.

### File Structure

```
src/
  App.jsx                         # Router: ModeSelect → SoloGame | Lobby → MultiplayerGame
  reducer/
    gameReducer.js    (~632 lines) # Solo game state machine — all state transitions
    initialState.js   (~87 lines)  # createInitialState(), createHandObject(), initialState
    actions.js        (~60 lines)  # 25 action type constants + 15 action creators
    multiplayerReducer.js (~500 lines) # Multiplayer state machine
    multiplayerInitialState.js     # Multiplayer initial state (19 properties)
  hooks/
    useDealerTurn.js  (~66 lines)  # Dealer card drawing: 600ms between cards, 400ms before resolve
    useDealerMessage.js (~153 lines) # Dealer trash talk selection from 20 categories
    useAchievements.js (~158 lines)  # Achievement checking + localStorage persistence
    useLoanShark.js   (~55 lines)  # Loan shark popup triggers at 11 debt thresholds
    useSound.js       (~79 lines)  # Audio synthesis triggers on phase/result transitions
    useMultiplayerSound.js         # Multiplayer-specific sounds
    useWebSocket.js   (~207 lines) # WebSocket connection + exponential backoff reconnection
    useSessionPersistence.js (~74 lines) # localStorage save/load for settings
  components/ (46 files, ~2,800 lines total)
    SoloGame.jsx      (~435 lines) # Main solo container — reducer + all hooks
    ModeSelect.jsx                 # Initial mode picker (solo / multiplayer)
    Lobby.jsx         (~254 lines) # Multiplayer lobby — create/join rooms
    MultiplayerGame.jsx (~320 lines) # Multiplayer game container
    MultiplayerTable.jsx           # Multiplayer table with player spots
    PlayerSpot.jsx    (~111 lines) # Single player at multiplayer table
    Card.jsx          (~120 lines) # Card rendering with pips, face cards, corners
    Hand.jsx          (~52 lines)  # Fanned hand of cards with overlap
    DealerArea.jsx    (~52 lines)  # Dealer hand + speech bubble
    DealerSpeechBubble.jsx (~40 lines) # Dealer trash talk popup
    PlayerArea.jsx    (~102 lines) # Player hands grid with split support
    BettingCircle.jsx              # Circular bet spot with stacked chips + bet total
    BettingControls.jsx            # ChipTray + DEAL + ALL IN + undo/clear + asset betting
    ChipTray.jsx                   # Row of tappable chip denominations
    Chip.jsx          (~26 lines)  # Single casino chip (CSS 3D effect via CSS variables)
    FlyingChip.jsx    (~30 lines)  # Animated chip flying from tray to circle
    ActionButtons.jsx              # Hit / Stand / Double Down / Split
    ResultBanner.jsx  (~99 lines)  # Win/lose/push/blackjack banner
    BankrollDisplay.jsx            # Bankroll number with formatting
    Header.jsx        (~135 lines) # Top nav: mute, notifications, achievements, reset
    AchievementToast.jsx           # Single achievement notification
    AchievementPanel.jsx           # Full achievements list
    LoanSharkPopup.jsx (~23 lines) # Threatening loan shark messages
    DebtTracker.jsx   (~227 lines) # Debt visualization / financial journey chart
    TableLevelToast.jsx (~36 lines) # Table upgrade/downgrade notification
    QuickChat.jsx     (~74 lines)  # Quick chat messages (multiplayer)
    SessionLeaderboard.jsx (~60 lines) # Multiplayer leaderboard
    WaitingIndicator.jsx (~18 lines) # Loading spinner
  constants/
    gameConfig.js     # STARTING_BANKROLL, MIN_BET, DECK_COUNT, delays, WS_URL
    cards.js          # SUITS, SUIT_SYMBOLS, SUIT_COLORS, RANKS
    chips.js          # 10 chip denominations with colors
    assets.js         # 6 bettable assets with values and unlock thresholds
    achievements.js   # 30 achievement definitions
    dealerLines.js    # 20 dialogue categories, 10 lines each
    loanSharkMessages.js # 11 debt threshold messages
    tableLevels.js    # 6 cosmetic tiers + getTableLevel() + getTableChips()
    vigRates.js       # 8 vig tiers + getVigRate()
    creditLabels.js   # 7 credit tier labels + getCreditTierIndex()
    quickChatMessages.js # 8 predefined multiplayer chat messages
    pipLayouts.js     # Card pip position data for ranks 2-10
    faceCards.js      # J/Q/K accent characters for monogram design
  utils/
    cardUtils.js      # createDeck, shuffle, handValue, isSoft, isBlackjack, cardValue
    formatters.js     # formatMoney, pickRandom
    audioManager.js   # Web Audio API synthesizer (singleton)
    dealerMessages.js # selectDealerLine, determineDealerCategory
  styles/
    theme.css         # CSS variables, felt texture, global styles, font families
    animations.css    # @keyframes for dealing, flying chips, shake, toasts
server/
  main.py            # FastAPI app, WebSocket handler, message routing
  game_logic.py      # GameEngine — rules, resolution, serialization
  game_room.py       # GameRoom/PlayerState dataclasses
  card_engine.py     # Server-side deck/card utilities
  constants.py       # Game config, assets, vig tiers, dealer lines, quick chat
  test_game.py       # Pytest suite for game logic
  test_ws.py         # WebSocket integration tests
```

### Game Flow

Phases: `betting` → `playing` → `dealerTurn` → `result` → back to `betting`.

`RESOLVE_HAND` is the critical action — it calculates payout, updates bankroll, checks achievements, checks loan shark thresholds, selects dealer message, and handles asset return/loss. Most bugs will be here. It has a double-dispatch guard: `if (state.phase === 'result' && state.chipStack.length === 0) return state`.

**Edge cases that skip the dealer turn:**
- Blackjack on deal → straight to result
- All player hands bust (including after splits) → straight to result
- Dealer has blackjack → straight to result

### Deck Management

The component picks the cards, the reducer processes them. A helper function reads cards from `state.deck` and passes them via action payloads. This keeps the reducer deterministic and testable.

- 6-deck shoe (312 cards)
- Reshuffles when fewer than 75 cards remain (`RESHUFFLE_THRESHOLD`)
- `createDeck(deckCount)` returns a pre-shuffled deck
- `shuffle(deck)` uses Fisher-Yates (mutates in-place)

### Utility Functions

```javascript
// cardUtils.js
cardValue(card)      // → 11 (ace), 10 (face), pip value (2-10)
createDeck(count=6)  // → shuffled deck array (count * 52 cards)
shuffle(deck)        // → Fisher-Yates in-place, returns same array
handValue(hand)      // → best total (aces auto-adjust 11→1)
isSoft(hand)         // → boolean: has ace counted as 11
isBlackjack(hand)    // → boolean: exactly 2 cards totaling 21

// formatters.js
formatMoney(amount)  // → "$1,234" via Intl.NumberFormat
pickRandom(array)    // → random element

// audioManager.js (singleton)
audioManager.init()          // lazy-init on first pointerdown
audioManager.play(soundName) // no-op if muted or uninitialized
audioManager.setMuted(bool)
audioManager.isMuted()

// dealerMessages.js
selectDealerLine(category, shownDealerLines, context)  // → { message, updatedShownLines }
determineDealerCategory(prevState, newState, trigger)   // → { category, context } | null
```

### Sound System

All sounds are synthesized via Web Audio API — no audio files. The `audioManager.js` singleton generates sounds programmatically using oscillators, noise, and filters.

**Sounds:** `chip_place`, `chip_stack`, `card_deal`, `card_flip`, `win`, `lose`, `blackjack`, `bust`.

**Important:** AudioContext must be initialized on first user gesture (Safari requirement). `useSound` listens for the first `pointerdown`, calls `audioManager.init()`, then removes the listener. `audioManager.play()` silently no-ops if not yet initialized or if muted.

Chip sounds are triggered directly in `SoloGame.handleChipTap` for instant feedback (not through the hook).

### localStorage Persistence

| Key | Type | Purpose |
|-----|------|---------|
| `blackjack_achievements` | JSON array | Achievement IDs earned |
| `blackjack_muted` | string `'true'`/`'false'` | Mute preference |
| `blackjack_notifications` | string `'true'`/`'false'` | Toast notification preference |
| `blackjack_highest_debt` | number as string | Lowest bankroll ever reached |

**sessionStorage (multiplayer only):**
- `mp_player_id`, `mp_room_code`, `mp_session_token` — for reconnection after page reload. Cleared on disconnect, reconnect failure, or manual leave.

### Hook Patterns

All hooks follow these patterns:

- **Load-once guard:** `useAchievements`, `useDealerMessage`, `useSessionPersistence` use a `loadedRef.current` flag to fire load logic only once, surviving React StrictMode double-mount.
- **Debounced dispatch:** `useLoanShark` debounces messages 1500ms after last bankroll drop to avoid spam.
- **Shown-line tracking:** `useDealerMessage` tracks which lines per category have been shown to avoid repeats. When all exhausted, resets and picks from full list.

## Game Constants

### Chip Denominations (10 chips)

| Value | Label | Color |
|-------|-------|-------|
| $25 | 25 | Coral (#FF8B8B) |
| $100 | 100 | Sky Blue (#7AB5E6) |
| $500 | 500 | Orchid (#D291FF) |
| $1,000 | 1K | Peach (#FFB366) |
| $5,000 | 5K | Seafoam (#7FFFD4) |
| $25,000 | 25K | Pearl (#F8F9FA) |
| $100,000 | 100K | Gold (#DAA520) |
| $500,000 | 500K | Platinum (#C0C0C0) |
| $1,000,000 | 1M | Purple (#8E24AA) |
| $10,000,000 | 10M | Obsidian (#1a1a1a) |

Not all chips visible at once — table level determines which 5 are shown.

### Table Levels (6 cosmetic tiers)

| Level | Name | Unlocks At | Min Bet | Max Bet | Visible Chips |
|-------|------|-----------|---------|---------|---------------|
| 0 | The Felt | $0 | $25 | $5K | 25, 100, 500, 1K, 5K |
| 1 | Emerald Room | $100K | $500 | $25K | 100, 500, 1K, 5K, 25K |
| 2 | High Roller Lounge | $500K | $1K | $100K | 500, 1K, 5K, 25K, 100K |
| 3 | Penthouse | $2M | $10K | $500K | 1K, 5K, 25K, 100K, 500K |
| 4 | Vault | $5M | $100K | $5M | 5K, 25K, 100K, 500K, 1M |
| 5 | Obsidian Room | $10M | $1M | $10M | 25K, 100K, 500K, 1M, 10M |

Bankroll <= $0 always resets to level 0. Table level calculated dynamically in `RESOLVE_HAND` via `getTableLevel(bankroll)`. Level changes trigger a toast and dealer message. `selectedChipValue` is auto-corrected if no longer in the new level's chip set.

### Assets (6 bettable items)

| Asset | Value | Unlocks At Bankroll |
|-------|-------|-------------------|
| Watch | $500 | $0 |
| Jewelry | $2,000 | -$500 |
| Tesla Model 3 | $35,000 | -$2,000 |
| Kidney | $50,000 | -$10,000 |
| House | $250,000 | -$30,000 |
| Immortal Soul | $666,666 | -$200,000 |

Assets bet alongside chip bets. Asset value adds to `hand[0]`'s total bet only. On win/push: asset returned. On loss: asset permanently lost (`ownedAssets[id] = false`).

### Vig Rates (8 tiers)

| Bankroll Range | Rate |
|---------------|------|
| >= $0 | 2% |
| $0 to -$10K | 4% |
| -$10K to -$50K | 7% |
| -$50K to -$250K | 10% |
| -$250K to -$500K | 15% |
| -$500K to -$1M | 20% |
| -$1M to -$5M | 27.5% |
| Below -$5M | 40% |

Formula: `vig = floor(max(0, bet - max(0, bankroll)) * rate)` — only the **borrowed portion** is charged. Applied at DEAL, DOUBLE_DOWN, and SPLIT. Deducted from bankroll immediately.

### Loan Shark Thresholds (11 messages)

Triggered at: -$1K, -$5K, -$10K, -$25K, -$50K, -$100K, -$250K, -$500K, -$1M, -$5M, -$10M.

### Achievements (30 total)

**Categories:**
- Hand-based: `first_hand`, `first_win`, `first_loss`, `blackjack`, `hands_50`, `hands_100`, `first_split`
- Bankroll: `broke`, `deep_debt`, `million_debt`
- Streaks: `win_streak_5`, `win_streak_10`, `lose_streak_5`, `lose_streak_10`
- Double/Split: `double_down_win`, `double_down_loss`, `split_four`, `split_both_win`, `split_both_bust`
- All-in: `all_in_win`, `all_in_loss`
- Asset betting: `bet_watch`, `bet_car`, `bet_kidney`, `bet_house`, `bet_soul`, `lose_everything`
- Debt: `comeback`, `point_of_no_return`

### Key Config Values

```
STARTING_BANKROLL    = 10,000
MIN_BET             = 25
DECK_COUNT          = 6 (312 cards)
RESHUFFLE_THRESHOLD = 75 cards remaining
DEALER_HIT_DELAY    = 600ms
DEALER_STAND_DELAY  = 400ms
BLACKJACK_PAYOUT    = 1.5 (3:2)
MAX_VISUAL_CHIPS    = 12 (visual cap in betting circle)
MAX_SPLIT_HANDS     = 4
```

## Debt Gate Flow

1. Player starts with $10,000 cash + 6 assets
2. Cash reaches $0 → chip tray locks (`ADD_CHIP` blocked by `bankroll <= 0 && !inDebtMode`)
3. **Asset gate:** UI shows "BET AN ASSET" overlay. Assets unlock progressively by bankroll threshold.
4. Player bets asset → if they **lose**, bankroll drops by bet + asset value. Asset is gone.
5. Cycle repeats: deeper debt unlocks next asset
6. **Loan gate:** When all assets lost and bankroll <= 0, "TAKE A LOAN" button appears
7. `TAKE_LOAN` → `inDebtMode = true` → chip tray unlocks. Vig applies on all borrowed bets.
8. If player wins back above MIN_BET: `inDebtMode` resets to false in `RESOLVE_HAND`

## Split System

- Same **rank** required (not same value — K+Q cannot split)
- Max 4 hands (`MAX_SPLIT_HANDS`)
- Split aces: one card each, auto-stand, no re-split, no double down
- Double after split: allowed (except split aces)
- Split hand 21 with 2 cards: pays 1:1 (not blackjack 3:2)

**activeHandIndex** tracks which hand the player is currently playing. `advanceToNextHand()` scans forward for the next hand with `status === 'playing'`. If none found, transitions to `dealerTurn` (or `result` if all bust). Don't manually set hand status — let the advance function handle transitions.

## Multiplayer

### WebSocket Connection

`useWebSocket(dispatch)` returns `{ send, disconnect }`. Uses module-level `activeWs` reference that survives React StrictMode mount-unmount cycles.

- Heartbeat: client sends `pong` in response to server `ping` (every 30s, timeout 45s)
- Reconnection: exponential backoff 1s → 2s → 4s with jitter, max 3 attempts
- Session persistence via sessionStorage for page-reload recovery

### Server Rate Limits

- Quick chat: 2-second cooldown per player
- Game actions: 0.2-second cooldown per player
- Turn timer: 60s auto-stand if AFK
- Bet timer: 30s auto-skip if AFK during betting

### Server Validation

- Bet: integer, >= MIN_BET ($25), <= MAX_BET ($10B)
- Debt gate enforced server-side (cash bets blocked when broke and not in debt mode)
- Turn validation: actions only accepted during player's turn
- Phase validation: each action checks correct phase
- Split: same rank, max 4 hands, no re-split aces, exactly 2 cards
- Double down: first 2 cards only, not split aces
- Player names: max 20 chars, `<>` stripped

## Critical Rules

1. **Bankroll CAN go negative.** Never add validation that prevents betting when broke — this is the core mechanic.
2. **Screen must NEVER shake.** Only the bankroll number element and the deal button can have shake/wobble animations.
3. **Cards must be large** — min 70px wide, rank text 14px+ (corners), center suit 34px+ (ace only).
4. **Background must look like green felt** — layered green base + noise/grain texture + radial "spotlight" gradient. Not just a dark gradient.
5. **Constants in separate files** — never hardcode dealer lines, achievements, assets, or game config values in components.
6. **Reducer purity** — no side effects, no randomness inside the reducer.
7. **Chip stacking** — players TAP chips that animate into a betting circle. No text input for bets. Chips tracked as array (`chipStack`), not a single number. See "Reducer Action Catalog" in ARCHITECTURE.md.
8. **Chip colors** — must be visually distinct per denomination. See chip table above.
9. **Dealer hits on soft 17** (A+6). Use `isSoft()`. See "Phase State Machine" in ARCHITECTURE.md.
10. **Double down auto-stands** — player cannot hit after doubling. One card only.
11. **BET_ASSET during 'playing' phase is intentional** — per spec Section 3.4, not dead code.
12. **No AI/Claude attribution in git commits** — never include "Co-Authored-By" or similar AI credit lines.

## Common Gotchas

- **Flying chip coordinates:** `FlyingChip` is fire-and-forget visual state (no reducer involvement). `circleRef` must be set before animation spawns or coordinates are wrong.
- **Split hand status:** Don't manually set hand status after bust/stand. `advanceToNextHand()` handles scanning for the next playable hand.
- **Debt mode exit:** `inDebtMode` resets to false only in `RESOLVE_HAND` when bankroll recovers to >= MIN_BET. Not on any win — specifically on bankroll recovery.
- **Dealer message repeats:** `selectDealerLine` tracks shown indices per category. When all lines in a category have been shown, it resets and picks from the full list again.
- **Vig double-counting:** Vig is only on the borrowed portion. If bankroll is positive, the formula `max(0, bet - max(0, bankroll))` ensures no vig on the covered portion.
- **Aggregate result for splits:** `determineAggregateResult(outcomes)` returns `'mixed'` if hands have different outcomes, `'blackjack'` if any hand blackjacks, `'bust'` if all bust, `'push'` if all push.

## Deployment

- Self-hosted on Ubuntu server (sia-server) via Docker
- Domain: `blackjack.siaahmadi.com`
- Frontend: Vite build → nginx container on port 3021 (internal 8080)
- Backend: FastAPI container on port 3022 (internal 8000)
- SSL via Cloudflare origin cert behind Nginx Proxy Manager

### Docker Setup

- **Frontend Dockerfile:** Multi-stage build (node:20-alpine → nginx:alpine-unprivileged). Copies nginx.conf, serves from `/usr/share/nginx/html`.
- **Backend Dockerfile:** python:3.12-slim, runs as non-root `appuser`, port 8000.
- **docker-compose.yml:** Two services (`frontend` port 3021:8080, `backend` expose 8000). Frontend depends_on backend.

### Nginx Config

- SPA fallback: `try_files $uri $uri/ /index.html`
- WebSocket proxy: `/ws` → `http://backend:8000/ws` with upgrade headers, 86400s read timeout
- Health check: `/health` → `http://backend:8000/health`
- Security headers: X-Frame-Options, X-Content-Type-Options, CSP, HSTS
- Caching: `/assets/` and `/sounds/` cached 1 year
- Gzip enabled

### Public Assets

- `favicon.svg`, `icon-192.svg`, `icon-192.png`, `icon-512.png` — PWA icons
- `manifest.json` — PWA metadata
- No audio/image assets (all sounds synthesized, cards rendered via CSS/HTML)

## Reference

See `ARCHITECTURE.md` for state shapes and action catalog. See `GAME_LOGIC.md` for state machine, debt mechanics, and edge cases.
