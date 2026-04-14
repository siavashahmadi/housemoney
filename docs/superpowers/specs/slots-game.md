# House Money — Slots Game Spec

> This document specifies adding a slot machine game to House Money alongside the existing blackjack game. Two modes: (1) Solo Slots — classic slot machine vs. the house. (2) PvP Slots Battle — 2-4 players compete over fixed rounds of simultaneous spins; highest cumulative score wins the pot minus house edge.
>
> V1 covers Solo, 1v1, and FFA (2-4 players). Team-based 2v2 is V2 (not in scope).
>
> **This is an addition to the existing app. The blackjack game (solo + multiplayer) must remain fully intact and functional. No blackjack code should be removed or replaced.**

---

## Navigation

The app becomes a multi-game casino. ModeSelect gets a two-step flow:

**Step 1 — Game Picker:**
- Logo shows "HOUSE MONEY" (not "BLACKJACK")
- Two buttons: BLACKJACK (🃏) and SLOTS (🎰)

**Step 2 — Mode Picker:**
- Logo shows the selected game name
- Two buttons: SOLO and MULTIPLAYER/BATTLE
- Back button returns to game picker

`App.jsx`'s `mode` state expands: `null | 'solo-blackjack' | 'multiplayer-blackjack' | 'solo-slots' | 'multiplayer-slots'`. Each mode renders its own top-level component. The existing `SoloGame` and `MultiplayerApp` components are untouched.

**Files:** Modify `App.jsx`, `ModeSelect.jsx`, `ModeSelect.module.css`.

---

## Slot Mechanics

### Symbols (7 total, weighted)

| Symbol | Emoji | Value | Weight | Frequency |
|--------|-------|-------|--------|-----------|
| Cherry | 🍒 | 5 | 30 | 30% |
| Lemon | 🍋 | 10 | 25 | 25% |
| Orange | 🍊 | 15 | 20 | 20% |
| Bell | 🔔 | 25 | 12 | 12% |
| Diamond | 💎 | 50 | 7 | 7% |
| Seven | 7️⃣ | 100 | 4 | 4% |
| Jackpot | 💰 | 250 | 2 | 2% |

Total weight = 100. Symbol selection is a weighted random pick: generate float 0-1, multiply by 100, walk cumulative weights until exceeded.

### Scoring (3 reels per spin)

| Result | Calculation | Example |
|--------|-------------|---------|
| Triple (all 3 match) | value × 10 | 💎💎💎 = 500 pts |
| Pair (any 2 match) | matched value × 3 | 🔔🍋🔔 = 75 pts |
| No match | sum of all 3 values | 🍒🍊🔔 = 45 pts |

Pair check order: positions [0,1], then [1,2], then [0,2]. First match found wins.

### Solo Payout

```
payout = floor(score × bet / 100)
```

A score of 100 = break even. Most spins score below 100 (net loss). Triples pay huge. This creates a natural house edge without needing an explicit edge percentage.

### PvP Pot Distribution

- Each player pays buy-in: `rounds × bet_per_round`
- Pot: `buy_in × player_count`
- Winner (highest cumulative score): receives `floor(pot × 0.92)` (8% house edge)
- Tie at top: everyone gets refunded their buy-in (no house cut)

---

## File Organization

All slots UI goes in `src/components/slots/` (the existing `components/` directory already has 46+ files). Server files go alongside existing ones in `server/`.

### New Files

```
src/
  constants/
    slotSymbols.js              # SLOT_SYMBOLS array, TOTAL_WEIGHT, HOUSE_EDGE, ROUND_OPTIONS, SLOTS_STARTING_BANKROLL
  utils/
    slotUtils.js                # pickSymbol(), scoreReels(), generateSpin(), calculatePayout()
  reducer/
    slotsActions.js             # 11 action types + 7 action creators
    slotsInitialState.js        # createSlotsInitialState()
    slotsReducer.js             # Solo slots reducer
    slotsBattleReducer.js       # PvP slots reducer (server-driven state)
  hooks/
    useSlotsSound.js            # Sound triggers on phase/reelStops transitions
  components/
    slots/
      SlotReel.jsx + .module.css         # Single animated reel column
      SlotMachine.jsx + .module.css      # 3 reels + frame + match label
      SlotsBettingControls.jsx + .module.css  # ChipTray + SPIN button
      SlotsResultBanner.jsx + .module.css     # Win/loss display after spin
      SoloSlots.jsx + .module.css        # Solo game container
      SlotsLobby.jsx + .module.css       # PvP lobby with config
      MultiplayerSlots.jsx + .module.css # PvP battle view
      ScoreBar.jsx + .module.css         # Player score comparison bars
      MultiplayerSlotsApp.jsx            # PvP wrapper (reducer + WebSocket)
server/
  slots_constants.py            # Python mirror of symbols/weights/scoring
  slots_room.py                 # SlotsRoom/SlotsPlayerState dataclasses
  slots_engine.py               # SlotsEngine game logic class
```

### Modified Files

```
src/App.jsx                     # Add solo-slots + multiplayer-slots modes
src/components/ModeSelect.jsx   # Two-step game/mode picker
src/components/ModeSelect.module.css  # .disabled and .backButton styles
src/utils/audioManager.js       # Add slot_stop, slot_win, slot_jackpot, slot_pair sounds
src/hooks/useWebSocket.js       # Add slots message types to session persistence + queueable types
server/main.py                  # Add slots WebSocket handlers to message dispatch
```

**Critical: No existing blackjack files (SoloGame, MultiplayerGame, Lobby, gameReducer, multiplayerReducer, game_logic.py, game_room.py) should be modified or removed.**

---

## Phase 1: Constants & Utilities

### `src/constants/slotSymbols.js`

```javascript
export const SLOT_SYMBOLS = [
  { index: 0, emoji: '🍒', name: 'Cherry', value: 5, weight: 30 },
  { index: 1, emoji: '🍋', name: 'Lemon', value: 10, weight: 25 },
  { index: 2, emoji: '🍊', name: 'Orange', value: 15, weight: 20 },
  { index: 3, emoji: '🔔', name: 'Bell', value: 25, weight: 12 },
  { index: 4, emoji: '💎', name: 'Diamond', value: 50, weight: 7 },
  { index: 5, emoji: '7️⃣', name: 'Seven', value: 100, weight: 4 },
  { index: 6, emoji: '💰', name: 'Jackpot', value: 250, weight: 2 },
]
export const TOTAL_WEIGHT = 100
export const HOUSE_EDGE = 0.08
export const ROUND_OPTIONS = [5, 10, 15]
export const SLOTS_STARTING_BANKROLL = 10000
```

### `src/utils/slotUtils.js`

Pure functions — randomness passed as parameters (same pattern as blackjack's deck drawing):

- `pickSymbol(randomFloat)` — walks cumulative weights, returns symbol object
- `scoreReels(symbols)` — takes 3 symbols, returns `{ score, matchType, matchedSymbol }`
- `generateSpin(r1, r2, r3)` — calls pickSymbol 3 times, returns array of 3 symbols
- `calculatePayout(score, bet)` — returns `Math.floor(score * bet / 100)`

### `server/slots_constants.py`

Python mirror: same symbols array (as dicts), pick_symbol(), score_reels(), generate_spin(), calculate_payout(). The server generates spins for PvP (players don't send their own random values).

---

## Phase 2: Solo Slots Reducer

Follows exact same patterns as the blackjack reducer: pure, no side effects, randomness via action payloads.

### State Shape

```javascript
{
  phase: 'betting',              // 'betting' | 'spinning' | 'result'
  bankroll: 10000,
  chipStack: [],                 // array of chip values, same as blackjack
  selectedChipValue: 100,
  reels: [null, null, null],     // 3 symbol objects after spin
  reelStops: [false, false, false], // tracks which reels have finished animating
  score: 0,
  matchType: null,               // 'triple' | 'pair' | 'none'
  payout: 0,
  spinsPlayed: 0,
  totalWagered: 0,
  totalWon: 0,
  totalLost: 0,
  biggestWin: 0,
  peakBankroll: 10000,
  lowestBankroll: 10000,
  tripleCount: 0,
  jackpotCount: 0,
  muted: false,
}
```

### Action Types

`SLOTS_ADD_CHIP`, `SLOTS_UNDO_CHIP`, `SLOTS_CLEAR_CHIPS`, `SLOTS_SELECT_CHIP`, `SLOTS_ALL_IN`, `SLOTS_SPIN`, `SLOTS_REEL_STOP`, `SLOTS_RESOLVE`, `SLOTS_NEW_ROUND`, `SLOTS_RESET`, `SLOTS_TOGGLE_MUTE`.

### Key Reducer Cases

- `SLOTS_ADD_CHIP` — caps total at bankroll (no debt mode in slots)
- `SLOTS_SPIN` — transitions to `'spinning'`, stores reels from payload, deducts bet from bankroll, increments spinsPlayed and totalWagered
- `SLOTS_REEL_STOP` — marks `reelStops[index] = true` (tracks animation completion)
- `SLOTS_RESOLVE` — calls scoreReels() and calculatePayout(), credits bankroll with payout, updates stats
- `SLOTS_NEW_ROUND` — resets phase to `'betting'`, clears reels/stops/score, preserves chipStack for repeat bets
- `SLOTS_RESET` — full reset to initial state

### Chip Interaction Adapter

The existing `useChipInteraction` hook is reused via an adapter object:

```javascript
const slotsChipActions = {
  shouldBlock: (s) => s.phase !== 'betting' || s.bankroll <= 0,
  shouldBlockUndo: () => false,
  selectChip: (dispatch, value) => dispatch(slotsSelectChip(value)),
  addChip: (dispatch, value) => dispatch(slotsAddChip(value)),
  undo: (dispatch) => dispatch({ type: SLOTS_UNDO_CHIP }),
}
```

This is the same pattern as `soloChipActions` in SoloGame.jsx. No debt mode, no assets, no loan shark for slots.

---

## Phase 3: Solo Slots UI

### SlotReel (single animated column)

Renders a vertical strip of all 7 symbols repeated 6 times. Shows a 3-row viewport (above, **center**, below).

**Animation states:** `idle → spinning → landing → stopped`

- `spinning`: CSS `@keyframes reelSpin` rapidly scrolls the strip via translateY. Runs indefinitely until stopped.
- `landing`: After a delay (`800ms + stagger`), removes the spin animation and applies a CSS transition to the final translateY position. Uses `cubic-bezier(0.2, 1.3, 0.5, 1)` for overshoot-and-settle feel.
- `stopped`: Fires `onStop` callback via `onTransitionEnd`. This is how the parent knows a reel has finished.

**Key CSS variable:** `--symbol-height: 72px` (60px on short viewports via media query).

**Final position calculation:**
```javascript
const targetPos = 4 * SYMBOL_COUNT + targetIndex  // land on 4th repetition
const finalY = -(targetPos - 1)                    // offset by 1 for center row
// Applied as: transform: translateY(calc(${finalY} * var(--symbol-height)))
```

The center row has a payline overlay (gold-tinted border) to highlight the active row.

**Stagger delays:** Reel 0 = 0ms, Reel 1 = 300ms, Reel 2 = 600ms (reels stop left-to-right).

### SlotMachine (3-reel assembly)

Composes 3 `SlotReel` components side-by-side. Gold frame via `box-shadow` and border. Shows a match label overlay ("TRIPLE!" or "PAIR") after all reels stop, with a pop animation.

### SlotsBettingControls

Simplified betting — no assets, no side bets, no loan shark. Just:
- `ChipTray` (reused from blackjack)
- UNDO / CLEAR buttons
- ALL IN button
- SPIN button (gold gradient, large, Playfair Display font)

### SoloSlots (main container)

Equivalent of `SoloGame.jsx`:
- `useReducer(slotsReducer, null, createSlotsInitialState)`
- `useChipInteraction(dispatch, slotsChipActions, stateRef, circleRef, trayRef)`
- `handleSpin`: generates 3 `Math.random()` values, calls `generateSpin()`, dispatches `slotsSpin(reels)`
- `useEffect`: auto-resolves when all 3 `reelStops` are true → dispatches `slotsResolve()`
- Layout: Header → BankrollDisplay → SlotMachine → bet display → controls/result
- Reuses: `Header`, `BankrollDisplay`, `ChipTray`, `Chip`, `FlyingChip`, `useChipInteraction`, `formatMoney`, `audioManager`

### SlotsResultBanner

Shows after spin resolves: match type label, net payout (+$X or -$X), score detail. "SPIN AGAIN" button (or "NEW GAME" if bankroll ≤ 0).

---

## Phase 4: Server — PvP Slots Engine

### Room Model (`server/slots_room.py`)

**Separate from blackjack rooms.** Own `SlotsRoom` dataclass, own `slots_rooms` dict. Room codes check both dicts for collisions.

```python
@dataclass
class SlotsPlayerState:
    name: str
    player_id: str
    connected: bool = True
    is_host: bool = False
    session_token: str  # secrets.token_urlsafe(32)
    total_score: int = 0
    current_spin: list | None = None
    round_score: int = 0
    has_spun: bool = False

@dataclass
class SlotsRoom:
    code: str
    players: dict[str, SlotsPlayerState]
    phase: str = "lobby"  # lobby | spinning | round_result | final_result
    host_id: str | None = None
    total_rounds: int = 10
    bet_per_round: int = 100
    current_round: int = 0
    _lock: asyncio.Lock
```

Room management functions: `create_slots_room`, `add_player_to_slots_room`, `remove_player_from_slots_room`, `get_slots_player_list`, `reset_round_state`.

### Game Engine (`server/slots_engine.py`)

`SlotsEngine` class with methods:

- `start_game(room)` — validate player count (2-4) and config, set phase to "spinning", reset round state, return `slots_game_started` event
- `handle_spin(room, player_id)` — generate weighted-random spin server-side, score it, mark player as spun, add to total score. If all connected players have spun, auto-calls `resolve_round()`. Returns `slots_spin_result` event(s)
- `auto_spin(room, player_id)` — same as handle_spin but tags result with `auto: true` (for AFK players)
- `resolve_round(room)` — broadcast all player results sorted by total score. If final round reached, calls `end_game()`. Returns `slots_round_result` event
- `advance_round(room)` — increment round counter, reset per-round state, return `slots_round_started` event
- `end_game(room)` — determine winner, calculate pot and payout, handle ties (refund). Returns `slots_game_ended` event with final standings
- `return_to_lobby(room)` — reset all game state, return `slots_returned_to_lobby` event
- `get_room_state(room)` — serialize full state for reconnection

### WebSocket Handlers (`server/main.py`)

Add to `handle_message()` dispatch alongside existing blackjack messages:

| Message Type | Handler | Description |
|-------------|---------|-------------|
| `create_slots_room` | `handle_create_slots_room` | Create room, assign host |
| `join_slots_room` | `handle_join_slots_room` | Join existing room |
| `configure_slots` | `handle_configure_slots` | Host sets rounds/bet |
| `start_slots` | `handle_start_slots` | Host starts game |
| `slots_spin` | `handle_slots_spin` | Player spins |
| `leave_slots` | `handle_leave_slots` | Leave room, handle mid-game departure |
| `slots_play_again` | `handle_slots_play_again` | Host returns to lobby for rematch |

**AFK spin timer:** 10-second timeout per round. If a player hasn't spun when the timer fires, `auto_spin()` is called for them. Timer resets each round.

**Player departure mid-game:** If a player leaves during spinning phase and all remaining players have already spun, auto-resolve the round. If player count drops below 2, return to lobby.

**Important:** Track `player_game_types` (player_id → "blackjack" | "slots") so the generic `leave` and `handle_disconnect` handlers route to the correct game's cleanup logic. The existing `useWebSocket` hook is shared — it dispatches `SERVER_${TYPE}` actions regardless of game type, and each reducer ignores action types it doesn't recognize.

**Broadcast helper:** Slots rooms need their own broadcast function since `broadcast_to_room` uses blackjack's `get_room()`. Create `_slots_broadcast(room_code, message)` that iterates slots room players.

**Round advancement:** After resolving a round, schedule `_slots_advance_after_round()` with a 3-second delay to let clients display results before starting the next round.

---

## Phase 5: PvP Slots Frontend

### Battle Reducer (`src/reducer/slotsBattleReducer.js`)

Server-driven state (like `multiplayerReducer.js`). Data arrives in `action.payload`.

```javascript
{
  connected, playerId, roomCode, sessionToken, error,
  playerName, players, isHost,
  phase: 'disconnected',  // disconnected | lobby | spinning | round_result | final_result
  totalRounds, betPerRound,
  currentRound, pot, buyIn,
  playerStates: {},        // pid → { name, totalScore, hasSpun, roundScore, reels, matchType }
  roundResults: null,
  finalStandings: null,
  winnerPayout, houseCut, payoutType, isTie,
  muted: false,
}
```

Server action types: `SERVER_SLOTS_ROOM_CREATED`, `SERVER_SLOTS_PLAYER_JOINED`, `SERVER_SLOTS_CONFIGURED`, `SERVER_SLOTS_GAME_STARTED`, `SERVER_SLOTS_SPIN_RESULT`, `SERVER_SLOTS_ROUND_RESULT`, `SERVER_SLOTS_ROUND_STARTED`, `SERVER_SLOTS_GAME_ENDED`, `SERVER_SLOTS_PLAYER_LEFT`, `SERVER_SLOTS_RETURNED_TO_LOBBY`.

The existing `useWebSocket` hook works unchanged — it already dispatches `SERVER_${TYPE}` actions. Just add `slots_room_created` and `slots_player_joined` to its session persistence and queueable message lists.

### SlotsLobby

Same visual pattern as blackjack `Lobby.jsx`: name input, create/join buttons, room code display with tap-to-copy, player list with status dots. Adds:

- **Host config panel:** Round count toggle (5/10/15) + bet per round buttons ($100, $500, $1K, $5K) + calculated buy-in display
- **Non-host config display:** Read-only rounds/bet/buy-in info
- "START BATTLE" button (host only, requires 2+ players)

### MultiplayerSlots (battle view)

- **Header:** Leave button + "Round X of Y" + pot display
- **Center:** Own SlotMachine + SPIN button (only shown if haven't spun yet)
- **After spin:** "Waiting for other players..." message
- **Round result:** All players' names + round scores + running totals
- **Final result:** WIN/LOSE/TIE headline, pot info, ranked standings table with net +/- amounts, PLAY AGAIN button (host only)

### ScoreBar

Horizontal bars showing each player's cumulative score as proportional width. Leader highlighted with gold gradient. Updates with CSS transition animation after each round.

### MultiplayerSlotsApp (wrapper)

```jsx
function MultiplayerSlotsApp({ onBack }) {
  const [state, dispatch] = useReducer(slotsBattleReducer, slotsBattleInitialState)
  const { send, disconnect } = useWebSocket(dispatch)
  // Render SlotsLobby (lobby phase) or MultiplayerSlots (in-game phases)
}
```

---

## Phase 6: Sounds

Add to `audioManager.js` (synthesized, no audio files):

| Sound | Trigger | Description |
|-------|---------|-------------|
| `slot_stop` | Each reel stops | Mechanical thud: lowpass noise + bandpass click |
| `slot_win` | Result phase, score > 0 | Ascending chime: C5→E5→G5 |
| `slot_jackpot` | Triple match | Extended arpeggio: C5→E5→G5→C6→E6→G6 |
| `slot_pair` | Pair match | Two quick tones |

Create `useSlotsSound` hook: watches `state.phase`, `state.reelStops`, and `state.matchType` transitions. Plays sounds on reel stops (comparing previous vs current reelStops array) and on phase transition to result.

---

## Key Integration Patterns

### What to reuse from blackjack

- `Header` component (bankroll, mute, back button)
- `BankrollDisplay` component (bankroll number + hands/spins played)
- `ChipTray` + `Chip` components (chip denomination selection)
- `FlyingChip` component (chip animation)
- `useChipInteraction` hook (via adapter object)
- `useWebSocket` hook (shared WebSocket connection)
- `formatMoney` utility
- `audioManager` singleton
- CSS variables from `theme.css` (--gold, --surface, --felt-dark, etc.)

### What NOT to share

- Game reducers — solo slots has its own reducer, PvP slots has its own reducer
- Room models — `SlotsRoom` is separate from `GameRoom` (different fields, different lifecycle)
- Game engine — `SlotsEngine` is separate from `GameEngine`
- Room registries — `slots_rooms` dict is separate from `rooms` dict (but room code generation checks both)

### Lint rules to watch for

- `react-hooks/set-state-in-effect`: SlotReel uses `setTimeout` inside `useEffect` to trigger animation state changes. Wrap with `/* eslint-disable react-hooks/set-state-in-effect */` (matches DealerArea.jsx pattern).
- `react-hooks/refs`: SoloSlots assigns `stateRef.current = state` during render for use in callbacks. Use `// eslint-disable-line react-hooks/refs` (matches SoloGame.jsx pattern).

---

## Dependency Graph

```
Phase 1 (constants/utils) ─┬→ Phase 2 (solo reducer) → Phase 3 (solo UI)
                            └→ Phase 4 (server engine)
                                    ↓
                              Phase 5 (PvP frontend)
Phase 6 (sounds) — anytime after Phase 3
Navigation changes (App.jsx, ModeSelect.jsx) — after Phase 3
```

Phases 1-3 and Phase 4 can be built in parallel. Phase 5 depends on both Phase 4 (server) and Phase 3 (reuses SlotMachine component).

---

## Verification Checklist

### Solo
- [ ] Place bet → spin → reels animate left-to-right with stagger → result displayed
- [ ] Triple match pays `symbol.value × 10 × bet / 100`
- [ ] Pair pays `matched_symbol.value × 3 × bet / 100`
- [ ] No match pays `sum_of_values × bet / 100`
- [ ] Bankroll updates correctly after each spin
- [ ] Chip interaction works (tap chips, undo, clear, all-in)
- [ ] Stats track across spins (spinsPlayed, totalWagered, etc.)
- [ ] NEW GAME button appears when bankroll reaches 0
- [ ] Reel animations stop left-to-right with overshoot bounce

### Navigation
- [ ] ModeSelect shows game picker → mode picker → game loads
- [ ] Back buttons work at every level
- [ ] Blackjack solo + multiplayer still fully functional

### PvP
- [ ] Create room → configure rounds/bet → opponent joins → game starts
- [ ] Both players spin → results revealed simultaneously → scores update
- [ ] ScoreBar updates with animation after each round
- [ ] AFK player auto-spins after 10s timeout
- [ ] After final round → winner announced → pot distributed (minus 8%)
- [ ] Tie at top → everyone refunded
- [ ] 3-4 player FFA works
- [ ] Player departure mid-game handled gracefully
- [ ] Host can start new game after final result

### Sounds
- [ ] Reel stop thud plays for each reel
- [ ] Win/pair/jackpot sounds play on result
- [ ] Mute toggle works

### Build
- [ ] `npm run build` succeeds
- [ ] `npm run lint` clean
- [ ] Server tests pass
- [ ] No regressions in blackjack functionality
