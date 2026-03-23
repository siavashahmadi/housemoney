# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mobile-first blackjack web app with a dark casino green felt aesthetic. Core comedy mechanic: the player can never go broke — when bankroll hits $0, the casino extends unlimited credit, allowing the player to spiral into fictional debt (betting their watch, car, house, kidney, soul). Dealer trash-talks throughout, loan sharks send threatening messages, and achievements reward absurd behavior.

Read `BLACKJACK_TECHNICAL_DIRECTION.md` for the full spec — it is the single source of truth for features, design, architecture, and phased task breakdown.

## Build & Dev Commands

```bash
npm install          # install dependencies
npm run dev          # start Vite dev server
npm run build        # production build to dist/
```

## Tech Stack & Constraints

- **React 18+ with Vite** — no Next.js, no Astro
- **No Tailwind, no component libraries** (no MUI, no shadcn) — CSS variables in `theme.css` + CSS Modules (`.module.css`) for component-scoped styles. NOT inline style objects.
- **No external state management** (no Redux, no Zustand) — `useReducer` for ALL game state. `useState` only for local component UI concerns (animation triggers, transient visual states).
- **Fonts:** Playfair Display (headings), DM Sans (body), JetBrains Mono (numbers/money) via Google Fonts
- **Phase 2 backend:** Python FastAPI with native WebSocket support (not Socket.IO)

## Architecture

### State Management

All game state flows through a single `useReducer` in `App.jsx`. This is intentional — the original app had race condition bugs from scattered `useState` calls. The reducer must be **pure**: no `Math.random()` inside it. Pass randomness (drawn cards) via action payloads.

Key reducer actions: `ADD_CHIP`, `UNDO_CHIP`, `CLEAR_CHIPS`, `SELECT_CHIP`, `ALL_IN`, `DEAL`, `BET_ASSET`, `HIT`, `STAND`, `DOUBLE_DOWN`, `DEALER_DRAW`, `RESOLVE_HAND`, `NEW_ROUND`, `RESET_GAME`.

Betting uses a **chip-stacking system** — players tap chips that animate into a betting circle on the table. Bets are tracked as an array of chip values (`chipStack: [100, 100, 500]` = $700), not a single number. `DEAL` sums the `chipStack` into `currentBet`.

The dealer turn is animated outside the reducer via a `useDealerTurn` hook that dispatches `DEALER_DRAW` actions sequentially (600ms apart). Dealer hits on **soft 17** (A+6) — use the `isSoft()` helper.

### File Structure

- `src/reducer/` — `gameReducer.js`, `initialState.js`, `actions.js`
- `src/hooks/` — `useDealerTurn.js`, `useAchievements.js`, `useLoanShark.js`
- `src/components/` — one component per file:
  - `Card.jsx`, `Hand.jsx` — card rendering with overlap/fanning
  - `DealerArea.jsx`, `PlayerArea.jsx` — hand areas with labels
  - `BettingCircle.jsx` — circular bet spot showing stacked chips + bet total
  - `ChipTray.jsx` — row of tappable chip denominations
  - `Chip.jsx` — single casino chip (used in tray and betting circle)
  - `BettingControls.jsx` — wraps ChipTray + DEAL + ALL IN + undo/clear + asset betting
  - `ActionButtons.jsx` — Hit / Stand / Double Down
  - `ResultBanner.jsx`, `BankrollDisplay.jsx`, `Header.jsx`
  - `AchievementToast.jsx`, `AchievementPanel.jsx`, `LoanSharkPopup.jsx`
- `src/constants/` — `cards.js`, `chips.js`, `assets.js`, `achievements.js`, `dealerLines.js`, `loanSharkMessages.js`, `gameConfig.js`
- `src/utils/` — `cardUtils.js` (createDeck, shuffle, handValue, isSoft, isBlackjack), `formatters.js`
- `src/styles/` — `theme.css` (CSS variables, felt texture), `animations.css` (keyframes)

### Game Flow

Phases: `betting` → `playing` → `dealerTurn` → `result` → back to `betting`.

`RESOLVE_HAND` is the critical action — it calculates payout, updates bankroll, checks achievements, checks loan shark thresholds, selects dealer message, and handles asset return/loss. Most bugs will be here.

### Deck Management

The component picks the cards, the reducer processes them. A helper function reads cards from `state.deck` and passes them via action payloads. This keeps the reducer deterministic and testable. See Section 5.5 in the technical direction doc.

## Critical Rules

1. **Bankroll CAN go negative.** Never add validation that prevents betting when broke — this is the core mechanic.
2. **Screen must NEVER shake.** Only the bankroll number element and the deal button can have shake/wobble animations.
3. **Cards must be large** — min 70px wide, rank text 14px+ (corners), center suit 34px+ (ace only).
4. **Background must look like green felt** — layered green base + noise/grain texture + radial "spotlight" gradient. Not just a dark gradient.
5. **Constants in separate files** — never hardcode dealer lines, achievements, assets, or game config values in components.
6. **Reducer purity** — no side effects, no randomness inside the reducer.
7. **Chip stacking** — players TAP chips that animate into a betting circle. No text input for bets. Chips tracked as array (`chipStack`), not a single number. See Section 4.8.
8. **Chip colors** — green $25, black $100, purple $500, orange $1K, red $5K, cyan $25K. Must be visually distinct.
9. **Dealer hits on soft 17** (A+6). Use `isSoft()`. See Section 3.1.
10. **Double down auto-stands** — player cannot hit after doubling. One card only.

## Deployment

- Self-hosted on Ubuntu server (sia-server) via Docker
- Domain: `blackjack.siaahmadi.com`
- Frontend: Vite build → nginx container on port 3021
- Backend (Phase 2): FastAPI container on port 3022
- SSL via Cloudflare origin cert behind Nginx Proxy Manager

## Task Reference

Phase 1 tasks are in Section 10 of `BLACKJACK_TECHNICAL_DIRECTION.md`. Complete them in order (1.1 → 1.11). Each task should result in a working app. Key dependencies:

- **1.1** Project scaffolding, CSS variables, felt background, PWA meta tags
- **1.2** Card utilities, constants (cards, chips, assets, gameConfig), formatters
- **1.3** Game reducer with all actions (especially chip system + RESOLVE_HAND)
- **1.4** Card component + Hand component + felt background
- **1.5** Full layout: Header, BankrollDisplay, DealerArea, PlayerArea, ChipTray, BettingCircle, ActionButtons — **playable blackjack by end of this task**
- **1.6** Debt mechanic, asset betting, dynamic UI reactions
- **1.7** Dealer trash talk system
- **1.8** Loan shark messages
- **1.9** Achievement system
- **1.10** Polish: mobile optimization, sound effects (Web Audio API), localStorage persistence, performance
- **1.11** Docker + nginx + deployment
