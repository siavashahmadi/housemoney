# Blackjack: Unlimited Debt Edition

A mobile-first blackjack web app where you can never go broke -- the casino extends unlimited credit, letting you spiral into fictional debt by betting your watch, car, house, kidney, and immortal soul. A sarcastic dealer trash-talks your every decision while loan sharks send increasingly threatening messages. Play solo or bring friends to the table with real-time multiplayer.

**Live at:** [blackjack.siaahmadi.com](https://blackjack.siaahmadi.com)

---

## Features

### Core Gameplay
- **Unlimited debt mechanic** -- Bankroll goes negative with no floor. Bet $500K when you're already $1M in debt. The casino doesn't care.
- **Split hands** -- Split matching-rank pairs (e.g., two Kings, not King-Queen) into up to 4 hands. Split aces get one card each and auto-stand.
- **Double down** -- Double your bet mid-hand for one more card. Auto-stands afterward.
- **6-deck shoe** -- 312-card shoe reshuffled when fewer than 75 cards remain, checked between hands.

### Comedy Mechanics
- **Asset betting** -- When broke enough, bet physical possessions: watch ($500) -> jewelry ($2K) -> Tesla ($35K) -> kidney ($50K) -> house ($250K) -> soul ($666,666). Lost assets are gone for the session.
- **Dealer trash talk** -- 14 categories of sarcastic commentary triggered by game events (bust, blackjack, losing streak, betting your kidney). Tracks shown lines to avoid repeats.
- **Loan shark messages** -- 11 escalating threat popups at debt milestones from -$1K to -$10M, each triggering once per session.
- **Achievement system** -- 26 achievements tracking milestones, streaks, and absurd behavior. Persisted to localStorage.
- **Vig (interest) system** -- The casino charges interest on borrowed bets. Rates escalate from 2% to 40% as debt deepens.
- **Dynamic UI reactions** -- Subtitle text, button labels, and bankroll animations escalate based on debt level.

### Multiplayer (Phase 2)
- **Real-time WebSocket rooms** -- Up to 6 players at one virtual table, each playing their own hand against the shared dealer.
- **Room codes** -- 4-character codes (excluding ambiguous chars like I/1/O/0) for easy mobile sharing.
- **Quick chat** -- 8 predefined messages ("Nice hand!", "RIP", "You're insane") with 2-second cooldown.
- **Session leaderboard** -- Track who's winning (or losing the most spectacularly).
- **Debt tracker** -- See every player's financial ruin in real time.
- **Reconnection** -- 120-second grace period with session tokens. Disconnect mid-hand and rejoin without losing your spot.

### Production Features
- **Chip stacking** -- Tap casino chips ($25 to $1M) that animate into a betting circle. No text input. Fixed chip sets of 5 scale with debt level.
- **Debt gate** -- When bankroll hits $0, chip tray locks. Players must sell assets or "Take a Loan" to unlock unlimited credit (with escalating vig).
- **Synthesized sound effects** -- Web Audio API generates chip, card, win/lose sounds. No .mp3 files.
- **Session persistence** -- Achievements, mute preference, and highest debt survive page reload.
- **Mobile-first responsive design** -- Optimized for iPhone with CSS custom properties for responsive sizing.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 8 |
| State (Solo) | `useReducer` -- single pure reducer, no external libs |
| State (Multi) | Server-authoritative + local `useReducer` for UI state |
| Backend | Python FastAPI with native WebSocket support |
| Real-time | WebSocket (not Socket.IO) via FastAPI + nginx proxy |
| Styling | CSS Modules + CSS Variables (no Tailwind, no component libs) |
| Audio | Web Audio API (synthesized, no audio files) |
| Fonts | Playfair Display (headings), DM Sans (body), JetBrains Mono (money) |
| Deploy | Docker Compose (frontend nginx + backend uvicorn) |
| SSL | Cloudflare origin certificate |
| Runtime deps | **Zero** beyond React + ReactDOM (frontend), FastAPI + uvicorn (backend) |

---

## Architecture

### Mode Selection

The app starts at a mode selection screen. Users choose Solo (client-side only) or Multiplayer (WebSocket-connected). Each mode has its own component tree, reducer, and hooks.

```
App
├── ModeSelect                # Solo vs Multiplayer selection
├── SoloGame                  # Self-contained single-player
│   ├── (uses gameReducer)
│   └── (uses all solo hooks)
└── MultiplayerGame           # Server-connected multiplayer
    ├── Lobby                 # Create/join room, player list
    ├── MultiplayerTable      # Shared table with all player spots
    └── (uses multiplayerReducer + useWebSocket)
```

### Solo Mode Component Tree

```
SoloGame
├── Header                    # Logo, achievement count, mute toggle, reset
├── BankrollDisplay           # Bankroll amount with debt-tier animations
├── Table
│   ├── DealerArea            # Dealer cards + speech bubble + hand value
│   │   └── DealerSpeechBubble
│   ├── BettingCircle         # Circular bet spot with stacked chip visuals
│   └── PlayerArea            # Player hand(s) + values (supports split)
├── Controls (phase-dependent)
│   ├── BettingControls       # ChipTray + UNDO/CLEAR/ALL IN + AssetBetting + DEAL
│   ├── ActionButtons         # HIT / STAND / DOUBLE DOWN / SPLIT
│   ├── "Dealer's turn..."    # Animated waiting text
│   └── ResultBanner          # WIN/LOSE/BUST + NEXT HAND
├── FlyingChip                # Animated chip from tray to betting circle
├── LoanSharkPopup            # Debt milestone overlay
├── AchievementToast          # Achievement unlock notification
└── AchievementPanel          # Full achievement list overlay
```

### Multiplayer Component Tree

```
MultiplayerGame
├── Header                    # Logo, mute toggle
├── Lobby (pre-game)
│   ├── Create room / Join room forms
│   └── Player list + START GAME button (host only)
├── MultiplayerTable (in-game)
│   ├── DealerArea            # Shared dealer hand
│   ├── PlayerSpot (x6)       # Each player's cards, bet, status
│   ├── BettingCircle         # Local player's bet visualization
│   └── DebtTracker           # All players' bankroll comparison
├── Controls (phase + turn dependent)
│   ├── BettingControls       # Only during betting phase
│   ├── ActionButtons         # Only when it's your turn
│   ├── WaitingIndicator      # "Waiting for other players..."
│   └── ResultBanner          # Round results + auto-advance countdown
├── QuickChat                 # Predefined chat messages
└── SessionLeaderboard        # Rankings by bankroll
```

---

### Game Phase State Machine

Both solo and multiplayer follow the same phase model:

```
                    +-----------------------------------+
                    |                                   |
                    v                                   |
              +----------+    DEAL    +----------+      |
              | BETTING  |---------->| PLAYING  |      |
              +----------+           +----------+      |
                    ^                     |             |
                    |              HIT (bust)----> RESULT
                    |              STAND  |             |
                    |              SPLIT  |             |
                    |                     v             |
              +----------+         +-----------+       |
              |  RESULT  |<--------|DEALER TURN|       |
              +----------+         +-----------+       |
                    |                                   |
                    |          NEW ROUND                |
                    +-----------------------------------+
```

**Transitions:**
- `betting` -> `playing`: DEAL dispatched with 4 cards. Auto-resolves if either hand is blackjack.
- `playing` -> `playing`: HIT adds a card. SPLIT creates two hands from a pair. Player stays in `playing` until all hands resolve.
- `playing` -> `dealerTurn`: All player hands are standing (STAND or DOUBLE_DOWN without bust).
- `playing` -> `result`: All player hands have busted.
- `dealerTurn` -> `result`: Dealer finishes drawing (hits soft 17, stands hard 17+). All hands resolved.
- `result` -> `betting`: NEW_ROUND dispatched. Deck reshuffled if < 75 cards remain.

**Split-specific transitions:**
When a player splits, they get multiple hands with an `activeHandIndex` tracking which hand they're currently playing. Each hand is played to completion before advancing to the next. When all hands are done (standing or busted), the game transitions to `dealerTurn` or `result`.

---

### Data Flow

#### Solo Mode

```
User Event (tap chip, hit, stand)
         |
         v
  SoloGame.jsx handler (useCallback)
         |
         +-- Direct sound (chip tap -> audioManager.play)
         |
         v
  dispatch(action)  <-- Cards drawn from deck via stateRef
         |
         v
  gameReducer (PURE -- no side effects, no randomness)
         |
         v
  New state -> React re-render
         |
         +-- useDealerTurn: auto-draws dealer cards, resolves hand
         +-- useDealerMessage: selects trash talk line
         +-- useLoanShark: checks debt thresholds
         +-- useAchievements: checks unlock conditions
         +-- useSound: plays transition sounds
         +-- useSessionPersistence: syncs to localStorage
```

**Key design decision:** The reducer is pure. Randomness (card draws) happens in the component via `stateRef.current.deck.slice()` and is passed to the reducer via action payloads. This keeps the reducer deterministic and testable.

#### Multiplayer Mode

```
User Event (tap chip, hit, stand)
         |
         v
  MultiplayerGame.jsx handler
         |
         +-- Local dispatch (chip stacking, UI state)
         |
         v
  WebSocket send({ type: 'hit' })
         |
    [  NETWORK  ]
         |
         v
  FastAPI WebSocket handler (main.py)
         |
         v
  GameEngine method (game_logic.py)
         |
         +-- Validates action (correct player, correct phase, legal move)
         +-- Mutates server-side GameRoom state
         +-- Returns event list
         |
         v
  Broadcast events to all players in room
         |
    [  NETWORK  ]
         |
         v
  useWebSocket.js receives message
         |
         v
  multiplayerReducer processes SERVER_* action
         |
         v
  New state -> React re-render
```

**Key design decision:** In multiplayer, the server is authoritative for all game logic. The client handles only local UX state (chip stacking, mute toggle, UI animations). Card draws, payouts, and phase transitions all happen server-side.

---

### How WebSockets Work (Conceptual Guide)

WebSockets provide a persistent, bidirectional communication channel between the browser and server -- unlike HTTP where each request/response is independent.

#### The HTTP vs WebSocket Difference

```
HTTP (request-response):
  Client --[GET /data]--> Server
  Client <--[response]--- Server
  (connection closed)

  Client --[GET /data]--> Server    (new connection each time)
  Client <--[response]--- Server
  (connection closed)

WebSocket (persistent, bidirectional):
  Client --[HTTP Upgrade]--> Server     (one-time handshake)
  Client <========WS========> Server    (persistent connection)
     |                          |
     +--[send message]--------->|       (client can send anytime)
     |<--------[send message]---+       (server can send anytime)
     |                          |
     +--[send message]--------->|       (no new connection needed)
     |<--------[send message]---+       (server can push without request)
```

#### The WebSocket Lifecycle in This Project

**1. Connection (Handshake)**

The browser initiates a WebSocket connection via an HTTP Upgrade request:

```
GET /ws HTTP/1.1
Upgrade: websocket
Connection: Upgrade
```

The nginx config proxies `/ws` to the FastAPI backend:

```nginx
location /ws {
    proxy_pass http://backend:8000/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400;          # Keep alive for 24 hours
}
```

On the client, `useWebSocket.js` creates the connection:

```javascript
const ws = new WebSocket('wss://blackjack.siaahmadi.com/ws')
ws.onopen = () => { /* connected */ }
ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    dispatch({ type: `SERVER_${message.type.toUpperCase()}`, payload: message })
}
ws.onclose = () => { /* reconnect logic */ }
```

On the server, FastAPI accepts it:

```python
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    player_id = str(uuid.uuid4())
    # ... message loop
```

**2. Message Exchange**

All messages are JSON objects with a `type` field. The client sends actions, the server broadcasts events:

```
Client sends:                    Server broadcasts:
{ type: "create_room",    -->    { type: "room_created",
  name: "Alice" }                  code: "XK7D",
                                   player_id: "uuid-...",
                                   players: [...] }

{ type: "hit" }            -->   { type: "player_hit",
                                   player_id: "uuid-...",
                                   card: { rank: "K", suit: "spades" },
                                   hand_value: 20 }
```

The client's `useWebSocket` hook maps server message types to reducer actions with a `SERVER_` prefix: `player_hit` becomes `SERVER_PLAYER_HIT`.

**3. Heartbeat (Keep-Alive)**

WebSocket connections can silently die (network changes, server crashes). The server sends a `ping` every 30 seconds; the client must respond with `pong` within 10 seconds or the server considers the connection dead:

```
Server --[{ type: "ping" }]--> Client
Client --[{ type: "pong" }]--> Server    (within 10s)
```

If the pong never arrives, the server triggers disconnect handling.

**4. Reconnection**

When a connection drops, the client attempts to reconnect with exponential backoff (1s, 2s, 4s, 8s, up to 30s). If the player was in a room, it sends a `reconnect` message with a session token stored in `sessionStorage`:

```javascript
// Client reconnection
ws.send(JSON.stringify({
    type: 'reconnect',
    session_token: sessionStorage.getItem('mp_session_token'),
    room_code: sessionStorage.getItem('mp_room_code')
}))
```

The server validates the token and restores the player to their seat within the 120-second grace period. Other players see a "reconnected" notification.

**5. Disconnection Cleanup**

When a player disconnects:
- Their `connected` flag is set to `false` on the server
- If it's their turn, the turn auto-advances to the next player
- A 120-second timer starts; if they don't reconnect, they're removed from the room
- If all players disconnect, the room is cleaned up after 5 minutes

#### WebSocket Message Protocol

**Client -> Server (actions):**

| Message Type | Payload | When |
|-------------|---------|------|
| `create_room` | `{ name }` | Creating a new room |
| `join_room` | `{ name, code }` | Joining existing room |
| `reconnect` | `{ session_token, room_code }` | Reconnecting after disconnect |
| `start_game` | -- | Host starts the game (min 2 players) |
| `place_bet` | `{ amount }` | Submitting bet for the round |
| `bet_asset` | `{ asset_id }` | Adding an asset to the bet |
| `hit` | -- | Drawing a card |
| `stand` | -- | Ending turn on current hand |
| `double_down` | -- | Doubling bet + one card |
| `split` | -- | Splitting a pair |
| `leave` | -- | Leaving the room |
| `quick_chat` | `{ message_id }` | Sending a predefined chat message |
| `pong` | -- | Responding to server heartbeat |

**Server -> Client (events):**

| Message Type | Description |
|-------------|-------------|
| `room_created` | Room created, includes code + player_id + session_token |
| `room_joined` | Successfully joined, includes full room state |
| `player_joined` | Another player joined the room |
| `player_left` | A player left the room |
| `player_disconnected` | A player's connection dropped |
| `player_reconnected` | A player reconnected |
| `game_started` | Game has begun |
| `betting_phase` | New round, time to place bets |
| `player_bet` | A player placed their bet |
| `cards_dealt` | Initial 4 cards dealt to each player + dealer |
| `your_turn` | It's this player's turn to act |
| `player_hit` | A player drew a card |
| `player_stand` | A player stood |
| `player_double_down` | A player doubled down |
| `player_bust` | A player busted |
| `player_split` | A player split their hand |
| `dealer_card` | Dealer drew a card (animated sequentially) |
| `round_result` | Final results for all players |
| `host_changed` | Room host transferred |
| `quick_chat` | A player sent a chat message |
| `ping` | Server heartbeat check |
| `error` | Error message (invalid action, not your turn, etc.) |

---

### State Shape

#### Solo Mode State

```javascript
{
  // Deck -- 6-deck shoe (312 cards), reshuffled at <75 remaining
  deck: [{ rank: 'A', suit: '♠', id: '♠-A-0' }, ...],

  // Hands (supports split -- array of hand objects)
  playerHands: [{
    cards: [{ rank: 'A', suit: '♠' }, { rank: 'K', suit: '♥' }],
    bet: 500,
    isDoubledDown: false,
    result: null,           // null | 'win' | 'lose' | 'bust' | 'blackjack' | 'push' | 'dealerBust'
    payout: 0,
    status: 'playing'       // 'playing' | 'standing' | 'bust' | 'done'
  }],
  activeHandIndex: 0,       // Which split hand the player is currently playing
  dealerHand: [],

  // Money
  bankroll: 10000,          // Can go negative (core mechanic)
  currentBet: 0,            // Locked in on DEAL (sum of chipStack)
  chipStack: [],            // [100, 100, 500] = $700 bet (array, not number)
  selectedChipValue: 100,   // Last tapped chip denomination

  // Vig
  vigAmount: 0,             // Interest charged on this hand's borrowed portion
  vigRate: 0,               // Current interest rate tier

  // Assets
  ownedAssets: { watch: true, jewelry: true, ... },
  bettedAssets: [],          // Assets wagered on current hand

  // Game flow
  phase: 'betting',          // 'betting' | 'playing' | 'dealerTurn' | 'result'
  result: null,              // Aggregate result across all hands
  isAllIn: false,
  inDebtMode: false,         // Unlocked via TAKE_LOAN when broke with no assets

  // Dealer
  dealerMessage: '',         // Current trash talk line

  // Stats
  handsPlayed: 0,
  winStreak: 0,   loseStreak: 0,
  totalWon: 0,    totalLost: 0,
  peakBankroll: 10000,
  lowestBankroll: 10000,

  // Systems
  unlockedAchievements: [],
  seenLoanThresholds: [],
  shownDealerLines: {},      // { category: [indices] } -- no-repeat tracking

  // UI
  showAssetMenu: false,
  showAchievements: false,
  achievementQueue: [],
  loanSharkQueue: [],
  muted: false,
}
```

#### Multiplayer Mode State

```javascript
{
  // Connection
  connected: false,
  playerId: null,
  roomCode: null,
  sessionToken: null,

  // Room
  players: {},               // { playerId: { name, bankroll, hands, status, ... } }
  hostId: null,
  phase: 'disconnected',     // 'disconnected' | 'lobby' | 'betting' | 'playing' | 'dealerTurn' | 'result'

  // Dealer
  dealerHand: [],
  dealerHandValue: 0,

  // Local betting UI (client-side only)
  chipStack: [],
  selectedChipValue: 100,
  betSubmitted: false,

  // Turn tracking
  currentTurnPlayerId: null,
  currentTurnPlayerName: null,

  // Round results
  roundResults: null,
  nextRoundAt: null,          // Timestamp for auto-advance countdown

  // Chat
  chatMessages: [],

  // UI
  error: null,
  muted: false,
}
```

---

## Game Rules

### Standard Blackjack
- **6-deck shoe** (312 cards), reshuffled when fewer than 75 cards remain (between hands, not mid-hand)
- **Dealer hits on soft 17** -- a hand containing an ace counted as 11 that totals 17 (e.g., A+6). Stands on hard 17+.
- **Blackjack pays 3:2** -- $100 bet -> $150 profit, $250 total returned
- **Double down** -- Doubles bet, one card, auto-stand. Available on first two cards only.
- **Split** -- Split any pair of matching-rank cards (two Kings, two 7s -- not K-Q even though both are 10). Up to 4 hands total. Split aces receive one card each and auto-stand. 21 after split is a regular win, not blackjack.
- **No insurance, no surrender, no side bets**

### The Debt Mechanic
- Starting bankroll: $10,000
- Minimum bet: $25
- **Debt gate** -- When bankroll hits $0, chip tray locks behind a gate. Players must bet an asset (if owned) or "Take a Loan" to enter debt mode
- **Bankroll can go negative** -- once in debt mode, the casino extends unlimited credit with no floor
- The vig system charges interest on the borrowed portion of each bet
- Debt mode auto-clears when bankroll returns to positive

### Vig (Interest) Tiers

When a player bets more than their bankroll (or has a negative bankroll), the difference is "borrowed" and subject to vig:

| Bankroll Range | Vig Rate |
|---------------|----------|
| >= $0 | 2% |
| $0 to -$10K | 4% |
| -$10K to -$50K | 7% |
| -$50K to -$250K | 10% |
| -$250K to -$500K | 15% |
| -$500K to -$1M | 20% |
| -$1M to -$5M | 27.5% |
| Below -$5M | 40% |

Example: Player at -$5,000 bankroll bets $1,000. The entire $1,000 is borrowed. Vig = floor($1,000 x 0.04) = $40. The $40 is deducted from bankroll immediately at deal time, before the hand plays out.

### Asset Betting
Assets unlock progressively as debt deepens:

| Asset | Value | Unlocks At |
|-------|-------|-----------|
| Watch | $500 | $0 |
| Jewelry | $2,000 | -$500 |
| Tesla Model 3 | $35,000 | -$2,000 |
| Kidney | $50,000 | -$10,000 |
| House | $250,000 | -$30,000 |
| Immortal Soul | $666,666 | -$200,000 |

- **Win** -> asset returned + cash value won
- **Lose** -> asset gone permanently (for the session)
- **Push** -> asset returned
- Assets can be bet during the betting phase or mid-hand (during play)

---

## Project Structure

```
blackjack/
├── src/
│   ├── main.jsx                           # Entry point
│   ├── App.jsx                            # Root: mode select -> Solo or Multiplayer
│   ├── App.module.css
│   ├── reducer/
│   │   ├── gameReducer.js                 # Solo: pure state machine, ~26 action types
│   │   ├── initialState.js                # Solo: state factory ($10K bankroll, fresh deck)
│   │   ├── actions.js                     # Solo: action type constants + creators
│   │   ├── multiplayerReducer.js          # Multi: processes SERVER_* events + local UI
│   │   └── multiplayerInitialState.js     # Multi: disconnected state factory
│   ├── hooks/
│   │   ├── useDealerTurn.js               # Solo: dealer card draws + hand resolution
│   │   ├── useDealerMessage.js            # Solo: trash talk line selection + dispatch
│   │   ├── useAchievements.js             # Solo: achievement checks + localStorage sync
│   │   ├── useLoanShark.js                # Solo: debt threshold monitoring
│   │   ├── useSound.js                    # Solo: sound triggers on state transitions
│   │   ├── useMultiplayerSound.js         # Multi: sound triggers for multiplayer events
│   │   ├── useWebSocket.js                # Multi: WebSocket connection + reconnection
│   │   └── useSessionPersistence.js       # Mute pref + highest debt persistence
│   ├── components/
│   │   ├── Card.jsx / .module.css         # Single playing card (rank, suit, face-down)
│   │   ├── Hand.jsx / .module.css         # Fanned hand with dynamic overlap
│   │   ├── DealerArea.jsx / .module.css   # Dealer hand + speech bubble + value
│   │   ├── PlayerArea.jsx / .module.css   # Player hand(s) + value(s)
│   │   ├── DealerSpeechBubble.jsx / .css  # Animated trash talk bubble
│   │   ├── BettingCircle.jsx / .module.css# Circular bet spot with stacked chips
│   │   ├── Chip.jsx / .module.css         # Casino chip (tray + stack sizes)
│   │   ├── ChipTray.jsx / .module.css     # Horizontal row of tappable chips
│   │   ├── FlyingChip.jsx                 # Animated chip from tray to circle
│   │   ├── BettingControls.jsx / .css     # ChipTray + buttons + assets + DEAL
│   │   ├── AssetBetting.jsx / .module.css # Expandable asset menu (overlays upward)
│   │   ├── ActionButtons.jsx / .module.css# HIT / STAND / DOUBLE DOWN / SPLIT
│   │   ├── ResultBanner.jsx / .module.css # Result text + NEXT HAND button
│   │   ├── Header.jsx / .module.css       # Logo, achievements, mute, reset
│   │   ├── BankrollDisplay.jsx / .css     # Bankroll with debt tier animations
│   │   ├── LoanSharkPopup.jsx / .css      # Debt milestone popup overlay
│   │   ├── AchievementToast.jsx / .css    # Achievement unlock notification
│   │   ├── AchievementPanel.jsx / .css    # Full achievement list overlay
│   │   ├── SoloGame.jsx                   # Solo mode container + hook wiring
│   │   ├── MultiplayerGame.jsx            # Multiplayer mode container
│   │   ├── ModeSelect.jsx                 # Solo vs Multiplayer selection screen
│   │   ├── Lobby.jsx                      # Room creation/joining + player list
│   │   ├── MultiplayerTable.jsx           # Shared table with all player spots
│   │   ├── PlayerSpot.jsx                 # Individual player's cards/bet at the table
│   │   ├── WaitingIndicator.jsx           # "Waiting for other players..." animation
│   │   ├── QuickChat.jsx                  # Predefined chat message buttons
│   │   ├── SessionLeaderboard.jsx         # In-session player rankings
│   │   └── DebtTracker.jsx                # All players' bankroll visualization
│   ├── constants/
│   │   ├── gameConfig.js                  # STARTING_BANKROLL, MIN_BET, DECK_COUNT, etc.
│   │   ├── cards.js                       # SUITS, RANKS, SUIT_SYMBOLS, SUIT_COLORS
│   │   ├── chips.js                       # 9 denominations, getVisibleChips() returns 5 per range
│   │   ├── assets.js                      # 6 assets with values + unlock thresholds
│   │   ├── achievements.js                # 26 achievement definitions
│   │   ├── dealerLines.js                 # All trash talk lines by category
│   │   ├── loanSharkMessages.js           # 11 debt milestone messages
│   │   ├── quickChatMessages.js           # 8 predefined multiplayer chat messages
│   │   ├── creditLabels.js                # Dynamic subtitle text by debt level
│   │   ├── vigRates.js                    # Vig tier definitions
│   │   ├── pipLayouts.js                  # Card pip position data
│   │   └── faceCards.js                   # Face card rendering data
│   ├── utils/
│   │   ├── cardUtils.js                   # createDeck, shuffle, handValue, isSoft, isBlackjack
│   │   ├── dealerMessages.js              # selectDealerLine, determineDealerCategory
│   │   ├── formatters.js                  # formatMoney
│   │   └── audioManager.js               # Web Audio API sound synthesis
│   └── styles/
│       ├── theme.css                      # CSS variables, felt texture, base reset
│       └── animations.css                 # @keyframes for cards, chips, toasts
├── server/
│   ├── main.py                            # FastAPI app, WebSocket endpoint, connection manager
│   ├── game_logic.py                      # GameEngine: all game rules, dealer turn, resolution
│   ├── game_room.py                       # GameRoom + PlayerState dataclasses, room management
│   ├── card_engine.py                     # Deck creation, shuffle, hand_value, is_soft
│   ├── constants.py                       # Server-side game config, assets, vig tiers, chat
│   ├── test_game.py                       # Comprehensive game logic tests
│   ├── test_ws.py                         # WebSocket integration tests
│   ├── Dockerfile                         # Python 3.12-slim + uvicorn
│   └── requirements.txt                   # fastapi, uvicorn
├── Dockerfile                             # Multi-stage: Node 20 build -> nginx alpine serve
├── docker-compose.yml                     # frontend (port 3021) + backend (port 8000)
├── nginx.conf                             # SPA routing, WebSocket proxy, security headers
├── package.json
├── CLAUDE.md                              # AI coding instructions
└── BLACKJACK_TECHNICAL_DIRECTION.md       # Full product spec (source of truth)
```

---

## Development

### Frontend

```bash
npm install          # Install dependencies (React + Vite only)
npm run dev          # Start Vite dev server (localhost:5173)
npm run build        # Production build -> dist/
npm run lint         # ESLint
npm run preview      # Preview production build locally
```

### Backend

```bash
cd server
pip install -r requirements.txt          # Install FastAPI + uvicorn
uvicorn main:app --reload --port 8000    # Start dev server with hot reload
python -m pytest test_game.py -v         # Run game logic tests
python -m pytest test_ws.py -v           # Run WebSocket tests
```

### Running Both (Development)

Start the backend first, then the frontend. The Vite dev server proxies `/ws` to `localhost:8000` for local WebSocket development.

```bash
# Terminal 1: Backend
cd server && uvicorn main:app --reload --port 8000

# Terminal 2: Frontend
npm run dev
```

---

## Deployment

Self-hosted on Ubuntu via Docker Compose behind Nginx Proxy Manager.

```
Internet -> Cloudflare (SSL) -> Nginx Proxy Manager -> Docker Compose
                                                         ├── frontend (nginx, port 3021:8080)
                                                         │   ├── Serves static dist/ files
                                                         │   └── Proxies /ws to backend:8000
                                                         └── backend (uvicorn, port 8000)
                                                             └── FastAPI WebSocket server
```

```bash
# Build and run both services
docker compose up -d --build

# View logs
docker compose logs -f

# Restart after code changes
docker compose down && docker compose up -d --build
```

**Docker setup:**
- **Frontend**: Multi-stage build (Node 20 alpine -> nginx alpine-unprivileged). Serves built React app.
- **Backend**: Python 3.12-slim, runs as non-root `appuser`, exposes port 8000 via uvicorn.
- **nginx config**: SPA routing (`try_files`), WebSocket proxy (`/ws`), gzip, 1-year cache on `/assets/`, security headers (CSP, HSTS, X-Frame-Options).
- **Domain**: `blackjack.siaahmadi.com`
- **SSL**: Cloudflare origin certificate

---

## Design System

### Felt Background
Three CSS layers simulating casino green felt:
1. **Radial gradient** -- lighter center (spotlight), darker edges
2. **SVG noise texture** -- `feTurbulence` filter at 12% opacity for grain
3. **Dark green base** -- `#0c200c`

### Color Palette
```
Felt:    #0c200c (dark) -> #143a14 (mid) -> #1a5a1a (light) -> #2a7a2a (highlight)
Gold:    #f0c850 (primary), #d4a832 (dim)
Cards:   #f5f0e8 (white), #cc3333 (red suits), #1a1a2e (black suits)
Danger:  #e74c3c
Success: #27ae60
Text:    #e8e0d0 (primary), rgba(232,224,208,0.5) (dim)
```

### Typography
- **Playfair Display 900** -- Headings, DEAL button, result text
- **DM Sans 400/500/700** -- Body text, buttons, labels
- **JetBrains Mono 500/700** -- Bankroll numbers, bet totals, chip values

### Chip Colors & Sets

9 chip denominations, shown 5 at a time based on bankroll range:

| Value | Color | Visible Range |
|-------|-------|---------------|
| $25 | Coral-Rose | Bankroll > $0 |
| $100 | Sky-Blue | Bankroll > $0, Debt $0 to -$100K |
| $500 | Orchid-Purple | Bankroll > $0, Debt $0 to -$100K |
| $1,000 | Peach-Orange | All ranges except Debt < -$1M |
| $5,000 | Seafoam-Green | All ranges |
| $25,000 | Pearl-White | All debt ranges |
| $100,000 | Gold-Metallic | Debt < -$100K |
| $500,000 | Platinum-Silver | Debt < -$100K |
| $1,000,000 | Royal-Purple | Debt < -$1M |
