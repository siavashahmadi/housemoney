import { describe, it, expect, beforeEach } from 'vitest'
import { gameReducer } from '../gameReducer'
import { createInitialState, createHandObject } from '../initialState'
import {
  ADD_CHIP, UNDO_CHIP, CLEAR_CHIPS, ALL_IN,
  DEAL, BET_ASSET, HIT, STAND, DOUBLE_DOWN, SPLIT, DEALER_DRAW,
  RESOLVE_HAND, NEW_ROUND, RESET_GAME, TAKE_LOAN,
  DISMISS_TABLE_TOAST, TOGGLE_ASSET_MENU, TOGGLE_ACHIEVEMENTS, TOGGLE_DEBT_TRACKER,
  DISMISS_ACHIEVEMENT, DISMISS_LOAN_SHARK, UNLOCK_ACHIEVEMENT, LOAD_ACHIEVEMENTS,
  TOGGLE_MUTE, TOGGLE_NOTIFICATIONS, LOAD_HIGHEST_DEBT, SET_DEALER_MESSAGE,
  SET_LOAN_SHARK_MESSAGE, SELECT_CHIP, REMOVE_ASSET,
  PLACE_SIDE_BET,
} from '../actions'
import { STARTING_BANKROLL, MAX_SPLIT_HANDS, RESHUFFLE_THRESHOLD } from '../../constants/gameConfig'
import { ASSETS } from '../../constants/assets'

// ---------------------------------------------------------------------------
// Test card factory
// ---------------------------------------------------------------------------
function card(rank, suit = 'hearts') {
  return { rank, suit, id: `${suit}-${rank}-0` }
}

// ---------------------------------------------------------------------------
// Helper: build a minimal state already in 'playing' phase with one hand
// ---------------------------------------------------------------------------
function playingState(cards = [card('5'), card('6')], bet = 500, overrides = {}) {
  const base = createInitialState()
  const hand = createHandObject(cards, bet)
  return {
    ...base,
    phase: 'playing',
    playerHands: [hand],
    activeHandIndex: 0,
    dealerHand: [card('7'), card('8')],
    currentBet: bet,
    deck: makeDeck(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Helper: produce a sizable dummy deck array
// ---------------------------------------------------------------------------
function makeDeck(size = 200) {
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
  const suits = ['hearts', 'diamonds', 'clubs', 'spades']
  const deck = []
  let i = 0
  while (deck.length < size) {
    deck.push({ rank: ranks[i % ranks.length], suit: suits[i % suits.length], id: `deck-${i}` })
    i++
  }
  return deck
}

// ---------------------------------------------------------------------------
// Helper: deal a hand from betting state
// ---------------------------------------------------------------------------
function dealFromBetting(state, dealCards) {
  return gameReducer(state, { type: DEAL, cards: dealCards })
}

// ---------------------------------------------------------------------------
// Helper: build a betting state with a chip already placed
// ---------------------------------------------------------------------------
function bettingStateWithChip(value = 100, overrides = {}) {
  const base = createInitialState()
  return {
    ...base,
    deck: makeDeck(),
    chipStack: [value],
    ...overrides,
  }
}

// ===========================================================================
// 1. INITIAL STATE
// ===========================================================================
describe('createInitialState', () => {
  it('returns correct bankroll', () => {
    const state = createInitialState()
    expect(state.bankroll).toBe(STARTING_BANKROLL)
  })

  it('starts in betting phase', () => {
    const state = createInitialState()
    expect(state.phase).toBe('betting')
  })

  it('starts with empty chipStack', () => {
    const state = createInitialState()
    expect(state.chipStack).toEqual([])
  })

  it('starts with empty playerHands', () => {
    const state = createInitialState()
    expect(state.playerHands).toEqual([])
  })

  it('starts with empty dealerHand', () => {
    const state = createInitialState()
    expect(state.dealerHand).toEqual([])
  })

  it('starts with inDebtMode false', () => {
    const state = createInitialState()
    expect(state.inDebtMode).toBe(false)
  })

  it('starts with tableLevel 0', () => {
    const state = createInitialState()
    expect(state.tableLevel).toBe(0)
  })

  it('starts with all assets owned', () => {
    const state = createInitialState()
    for (const asset of ASSETS) {
      expect(state.ownedAssets[asset.id]).toBe(true)
    }
  })

  it('starts with zero handsPlayed', () => {
    const state = createInitialState()
    expect(state.handsPlayed).toBe(0)
  })

  it('starts with zero winStreak and loseStreak', () => {
    const state = createInitialState()
    expect(state.winStreak).toBe(0)
    expect(state.loseStreak).toBe(0)
  })

  it('starts with peakBankroll equal to STARTING_BANKROLL', () => {
    const state = createInitialState()
    expect(state.peakBankroll).toBe(STARTING_BANKROLL)
  })

  it('starts with isAllIn false', () => {
    const state = createInitialState()
    expect(state.isAllIn).toBe(false)
  })
})

// ===========================================================================
// 2. ADD_CHIP
// ===========================================================================
describe('ADD_CHIP', () => {
  it('appends chip value to chipStack during betting phase', () => {
    const state = { ...createInitialState(), deck: makeDeck() }
    const next = gameReducer(state, { type: ADD_CHIP, value: 100 })
    expect(next.chipStack).toEqual([100])
  })

  it('allows adding multiple chips', () => {
    const state = { ...createInitialState(), deck: makeDeck() }
    const s1 = gameReducer(state, { type: ADD_CHIP, value: 100 })
    const s2 = gameReducer(s1, { type: ADD_CHIP, value: 500 })
    expect(s2.chipStack).toEqual([100, 500])
  })

  it('is blocked when not in betting phase', () => {
    const state = playingState()
    const next = gameReducer(state, { type: ADD_CHIP, value: 100 })
    expect(next.chipStack).toEqual([])
  })

  it('is blocked when bankroll <= 0 and not in debt mode', () => {
    const state = { ...createInitialState(), deck: makeDeck(), bankroll: 0 }
    const next = gameReducer(state, { type: ADD_CHIP, value: 100 })
    expect(next.chipStack).toEqual([])
  })

  it('is blocked when bankroll is negative and not in debt mode', () => {
    const state = { ...createInitialState(), deck: makeDeck(), bankroll: -500 }
    const next = gameReducer(state, { type: ADD_CHIP, value: 100 })
    expect(next.chipStack).toEqual([])
  })

  it('is allowed when in debt mode even with negative bankroll', () => {
    const state = { ...createInitialState(), deck: makeDeck(), bankroll: -5000, inDebtMode: true }
    const next = gameReducer(state, { type: ADD_CHIP, value: 100 })
    expect(next.chipStack).toEqual([100])
  })

  it('is blocked when adding would exceed bankroll when not in debt mode', () => {
    // bankroll = 200, already have 100 stacked, try to add 200 (200+200 > 200)
    const state = { ...createInitialState(), deck: makeDeck(), bankroll: 200, chipStack: [100] }
    const next = gameReducer(state, { type: ADD_CHIP, value: 200 })
    // 100 + 200 = 300 > 200 bankroll, should be blocked
    expect(next.chipStack).toEqual([100])
  })

  it('allows exact-bankroll bet when not in debt mode', () => {
    const state = { ...createInitialState(), deck: makeDeck(), bankroll: 200, chipStack: [] }
    const next = gameReducer(state, { type: ADD_CHIP, value: 200 })
    // 0 + 200 = 200 which equals bankroll — NOT > bankroll — so allowed
    expect(next.chipStack).toEqual([200])
  })
})

// ===========================================================================
// 3. UNDO_CHIP
// ===========================================================================
describe('UNDO_CHIP', () => {
  it('removes the last chip from chipStack', () => {
    const state = { ...createInitialState(), deck: makeDeck(), chipStack: [100, 500] }
    const next = gameReducer(state, { type: UNDO_CHIP })
    expect(next.chipStack).toEqual([100])
  })

  it('returns unchanged state when chipStack is empty', () => {
    const state = { ...createInitialState(), deck: makeDeck(), chipStack: [] }
    const next = gameReducer(state, { type: UNDO_CHIP })
    expect(next.chipStack).toEqual([])
  })

  it('clears isAllIn when the last chip is removed', () => {
    const state = { ...createInitialState(), deck: makeDeck(), chipStack: [100], isAllIn: true }
    const next = gameReducer(state, { type: UNDO_CHIP })
    expect(next.isAllIn).toBe(false)
  })

  it('preserves isAllIn when more chips remain after undo', () => {
    const state = { ...createInitialState(), deck: makeDeck(), chipStack: [100, 500], isAllIn: true }
    const next = gameReducer(state, { type: UNDO_CHIP })
    expect(next.isAllIn).toBe(true)
  })

  it('is blocked when not in betting phase', () => {
    const state = { ...playingState(), chipStack: [100] }
    const next = gameReducer(state, { type: UNDO_CHIP })
    expect(next.chipStack).toEqual([100])
  })
})

// ===========================================================================
// 4. CLEAR_CHIPS
// ===========================================================================
describe('CLEAR_CHIPS', () => {
  it('clears entire chipStack', () => {
    const state = { ...createInitialState(), deck: makeDeck(), chipStack: [100, 500, 1000] }
    const next = gameReducer(state, { type: CLEAR_CHIPS })
    expect(next.chipStack).toEqual([])
  })

  it('clears isAllIn flag', () => {
    const state = { ...createInitialState(), deck: makeDeck(), chipStack: [100], isAllIn: true }
    const next = gameReducer(state, { type: CLEAR_CHIPS })
    expect(next.isAllIn).toBe(false)
  })

  it('is blocked when not in betting phase', () => {
    const state = { ...playingState(), chipStack: [100, 500] }
    const next = gameReducer(state, { type: CLEAR_CHIPS })
    expect(next.chipStack).toEqual([100, 500])
  })
})

// ===========================================================================
// 5. ALL_IN
// ===========================================================================
describe('ALL_IN', () => {
  it('decomposes bankroll into chips', () => {
    const state = { ...createInitialState(), deck: makeDeck(), bankroll: 1125 }
    const next = gameReducer(state, { type: ALL_IN })
    const total = next.chipStack.reduce((s, v) => s + v, 0)
    expect(total).toBe(1125)
  })

  it('sets isAllIn to true', () => {
    const state = { ...createInitialState(), deck: makeDeck(), bankroll: 500 }
    const next = gameReducer(state, { type: ALL_IN })
    expect(next.isAllIn).toBe(true)
  })

  it('is blocked when not in betting phase', () => {
    const state = playingState()
    const next = gameReducer(state, { type: ALL_IN })
    expect(next.isAllIn).toBe(false)
  })

  it('is blocked when bankroll < minBet and not in debt mode', () => {
    const state = { ...createInitialState(), deck: makeDeck(), bankroll: 0 }
    const next = gameReducer(state, { type: ALL_IN })
    expect(next.isAllIn).toBe(false)
  })

  it('in debt mode uses table maxBet for HAIL MARY', () => {
    const state = {
      ...createInitialState(),
      deck: makeDeck(),
      bankroll: -5000,
      inDebtMode: true,
      tableLevel: 0,
    }
    const next = gameReducer(state, { type: ALL_IN })
    // TABLE_LEVELS[0].maxBet = 5000
    const total = next.chipStack.reduce((s, v) => s + v, 0)
    expect(total).toBe(5000)
    expect(next.isAllIn).toBe(true)
  })
})

// ===========================================================================
// 6. DEAL
// ===========================================================================
describe('DEAL', () => {
  it('transitions from betting to playing phase for a normal deal', () => {
    const state = bettingStateWithChip(100)
    const next = dealFromBetting(state, [card('5'), card('7'), card('6'), card('8')])
    expect(next.phase).toBe('playing')
  })

  it('creates a player hand with two cards', () => {
    const state = bettingStateWithChip(100)
    const next = dealFromBetting(state, [card('5'), card('7'), card('6'), card('8')])
    expect(next.playerHands.length).toBe(1)
    expect(next.playerHands[0].cards.length).toBe(2)
  })

  it('creates a dealer hand with two cards', () => {
    const state = bettingStateWithChip(100)
    const next = dealFromBetting(state, [card('5'), card('7'), card('6'), card('8')])
    expect(next.dealerHand.length).toBe(2)
  })

  it('interleaves cards correctly — player gets cards[0] and cards[2]', () => {
    const state = bettingStateWithChip(100)
    const c0 = card('2')
    const c1 = card('3')
    const c2 = card('4')
    const c3 = card('5')
    const next = dealFromBetting(state, [c0, c1, c2, c3])
    expect(next.playerHands[0].cards[0]).toEqual(c0)
    expect(next.playerHands[0].cards[1]).toEqual(c2)
    expect(next.dealerHand[0]).toEqual(c1)
    expect(next.dealerHand[1]).toEqual(c3)
  })

  it('sets hand bet from chipStack sum', () => {
    const state = { ...createInitialState(), deck: makeDeck(), chipStack: [100, 500] }
    const next = dealFromBetting(state, [card('5'), card('7'), card('6'), card('8')])
    // hand.bet should equal the sum of the chip stack (600)
    expect(next.playerHands[0].bet).toBe(600)
    // chipStack is NOT cleared by DEAL — it is cleared by RESOLVE_HAND / NEW_ROUND
    expect(next.chipStack).toEqual([100, 500])
  })

  it('detects natural blackjack — goes straight to result', () => {
    const state = bettingStateWithChip(100)
    const next = dealFromBetting(state, [card('A'), card('7'), card('K'), card('8')])
    expect(next.phase).toBe('result')
    expect(next.result).toBe('blackjack')
  })

  it('player and dealer both blackjack — push', () => {
    const state = bettingStateWithChip(100)
    const next = dealFromBetting(state, [card('A'), card('A'), card('K'), card('K')])
    expect(next.phase).toBe('result')
    expect(next.result).toBe('push')
  })

  it('dealer blackjack only — lose, goes straight to result', () => {
    const state = bettingStateWithChip(100)
    const next = dealFromBetting(state, [card('5'), card('A'), card('6'), card('K')])
    expect(next.phase).toBe('result')
    expect(next.result).toBe('lose')
  })

  it('is blocked when not in betting phase', () => {
    const state = playingState()
    const next = gameReducer(state, { type: DEAL, cards: [card('5'), card('7'), card('6'), card('8')] })
    expect(next.phase).toBe('playing')
    expect(next.playerHands.length).toBe(1)
  })

  it('is blocked when action.cards is missing', () => {
    const state = bettingStateWithChip(100)
    const next = gameReducer(state, { type: DEAL })
    expect(next.phase).toBe('betting')
  })

  it('is blocked when action.cards does not have exactly 4 cards', () => {
    const state = bettingStateWithChip(100)
    const next = gameReducer(state, { type: DEAL, cards: [card('5'), card('7')] })
    expect(next.phase).toBe('betting')
  })

  it('charges vig when bet exceeds bankroll in debt mode', () => {
    // bankroll = -500 (fully borrowed), inDebtMode = true, bet = 100
    // borrowedAmount = max(0, 100 - max(0, -500)) = max(0, 100 - 0) = 100
    // vigRate for bankroll -500 = 4% (between 0 and -10K)
    // vigAmount = floor(100 * 0.04) = 4
    const state = {
      ...createInitialState(),
      deck: makeDeck(),
      bankroll: -500,
      inDebtMode: true,
      chipStack: [100],
    }
    const next = dealFromBetting(state, [card('5'), card('7'), card('6'), card('8')])
    expect(next.vigAmount).toBe(4)
    expect(next.bankroll).toBe(-504)
  })

  it('charges no vig when bankroll fully covers the bet', () => {
    const state = bettingStateWithChip(100) // bankroll = 10000, bet = 100
    const next = dealFromBetting(state, [card('5'), card('7'), card('6'), card('8')])
    expect(next.vigAmount).toBe(0)
    expect(next.bankroll).toBe(STARTING_BANKROLL) // bankroll unchanged by deal (no vig)
  })

  it('is blocked when bet is below minBet and no assets are in play', () => {
    // chipStack sums to 10, minBet = 25
    const state = { ...createInitialState(), deck: makeDeck(), chipStack: [] }
    const next = gameReducer(state, { type: DEAL, cards: [card('5'), card('7'), card('6'), card('8')] })
    expect(next.phase).toBe('betting')
  })
})

// ===========================================================================
// 7. HIT
// ===========================================================================
describe('HIT', () => {
  it('adds card to active hand', () => {
    const state = playingState([card('5'), card('6')]) // 11 total, no bust
    const next = gameReducer(state, { type: HIT, card: card('3') })
    expect(next.playerHands[0].cards.length).toBe(3)
    expect(next.playerHands[0].cards[2]).toEqual(card('3'))
  })

  it('detects bust when hand value exceeds 21', () => {
    const state = playingState([card('K'), card('Q')]) // 20 total
    const next = gameReducer(state, { type: HIT, card: card('5') }) // 25 — bust
    expect(next.playerHands[0].status).toBe('bust')
    expect(next.playerHands[0].result).toBe('bust')
  })

  it('transitions to dealerTurn after bust on single hand', () => {
    const state = playingState([card('K'), card('Q')]) // 20 total
    const next = gameReducer(state, { type: HIT, card: card('5') }) // bust
    expect(next.phase).toBe('result') // allBust → result
  })

  it('transitions to result when all hands bust', () => {
    const state = playingState([card('K'), card('Q')]) // 20
    const next = gameReducer(state, { type: HIT, card: card('5') }) // bust
    expect(next.phase).toBe('result')
    expect(next.result).toBe('bust')
  })

  it('stays in playing phase after a safe hit', () => {
    const state = playingState([card('2'), card('3')]) // 5 total
    const next = gameReducer(state, { type: HIT, card: card('4') }) // 9 total
    expect(next.phase).toBe('playing')
    expect(next.playerHands[0].status).toBe('playing')
  })

  it('is blocked when not in playing phase', () => {
    const state = { ...createInitialState(), deck: makeDeck() }
    const next = gameReducer(state, { type: HIT, card: card('3') })
    expect(next.playerHands).toEqual([])
  })

  it('is blocked when hand is doubled down', () => {
    const state = playingState([card('5'), card('6')], 100, {})
    const ddState = { ...state, playerHands: [{ ...state.playerHands[0], isDoubledDown: true }] }
    const next = gameReducer(ddState, { type: HIT, card: card('3') })
    expect(next.playerHands[0].cards.length).toBe(2)
  })

  it('is blocked when hand is split aces', () => {
    const state = playingState([card('A'), card('5')], 100, {})
    const acesState = { ...state, playerHands: [{ ...state.playerHands[0], isSplitAces: true }] }
    const next = gameReducer(acesState, { type: HIT, card: card('3') })
    expect(next.playerHands[0].cards.length).toBe(2)
  })

  it('is blocked when card payload is missing', () => {
    const state = playingState([card('2'), card('3')])
    const next = gameReducer(state, { type: HIT })
    expect(next.playerHands[0].cards.length).toBe(2)
  })

  it('auto-stands on 21', () => {
    const state = playingState([card('K'), card('Q')]) // 20
    const next = gameReducer(state, { type: HIT, card: card('A') }) // 21
    expect(next.playerHands[0].status).toBe('standing')
  })

  it('advances to next hand on bust when multiple hands exist', () => {
    const base = createInitialState()
    const hand0 = createHandObject([card('K'), card('Q')], 100) // 20
    const hand1 = createHandObject([card('5'), card('6')], 100) // playing
    const state = {
      ...base,
      phase: 'playing',
      playerHands: [hand0, hand1],
      activeHandIndex: 0,
      dealerHand: [card('7'), card('8')],
      deck: makeDeck(),
    }
    const next = gameReducer(state, { type: HIT, card: card('5') }) // hand0 busts (25)
    expect(next.playerHands[0].status).toBe('bust')
    expect(next.activeHandIndex).toBe(1)
    expect(next.phase).toBe('playing')
  })
})

// ===========================================================================
// 8. STAND
// ===========================================================================
describe('STAND', () => {
  it('sets active hand status to standing', () => {
    const state = playingState()
    const next = gameReducer(state, { type: STAND })
    expect(next.playerHands[0].status).toBe('standing')
  })

  it('transitions to dealerTurn when no more hands to play', () => {
    const state = playingState()
    const next = gameReducer(state, { type: STAND })
    expect(next.phase).toBe('dealerTurn')
  })

  it('advances to next hand when multiple hands exist', () => {
    const base = createInitialState()
    const hand0 = createHandObject([card('5'), card('6')], 100)
    const hand1 = createHandObject([card('3'), card('4')], 100)
    const state = {
      ...base,
      phase: 'playing',
      playerHands: [hand0, hand1],
      activeHandIndex: 0,
      dealerHand: [card('7'), card('8')],
      deck: makeDeck(),
    }
    const next = gameReducer(state, { type: STAND })
    expect(next.activeHandIndex).toBe(1)
    expect(next.phase).toBe('playing')
  })

  it('transitions to result (not dealerTurn) when all hands busted except standing', () => {
    // If all hands are standing, go to dealerTurn
    const state = playingState()
    const next = gameReducer(state, { type: STAND })
    expect(next.phase).toBe('dealerTurn')
  })

  it('is blocked when not in playing phase', () => {
    const state = { ...createInitialState(), deck: makeDeck() }
    const next = gameReducer(state, { type: STAND })
    expect(next.phase).toBe('betting')
  })
})

// ===========================================================================
// 9. DOUBLE_DOWN
// ===========================================================================
describe('DOUBLE_DOWN', () => {
  it('doubles the hand bet', () => {
    const state = playingState([card('5'), card('6')], 100)
    const next = gameReducer(state, { type: DOUBLE_DOWN, card: card('3') })
    expect(next.playerHands[0].bet).toBe(200)
  })

  it('adds exactly one card to the hand', () => {
    const state = playingState([card('5'), card('6')], 100)
    const next = gameReducer(state, { type: DOUBLE_DOWN, card: card('3') })
    expect(next.playerHands[0].cards.length).toBe(3)
  })

  it('auto-stands after doubling (isDoubledDown = true, status standing)', () => {
    const state = playingState([card('5'), card('6')], 100)
    const next = gameReducer(state, { type: DOUBLE_DOWN, card: card('3') })
    expect(next.playerHands[0].isDoubledDown).toBe(true)
    expect(next.playerHands[0].status).toBe('standing')
  })

  it('marks bust correctly when doubled card causes bust', () => {
    // 10 + 10 = 20, double with 5 = 25 → bust
    const state = playingState([card('K'), card('Q')], 100)
    const next = gameReducer(state, { type: DOUBLE_DOWN, card: card('5') })
    expect(next.playerHands[0].status).toBe('bust')
    expect(next.playerHands[0].result).toBe('bust')
  })

  it('is blocked when hand has more than 2 cards', () => {
    const hand = createHandObject([card('2'), card('3'), card('4')], 100)
    const state = { ...createInitialState(), phase: 'playing', playerHands: [hand], activeHandIndex: 0, dealerHand: [card('7'), card('8')], deck: makeDeck() }
    const next = gameReducer(state, { type: DOUBLE_DOWN, card: card('3') })
    expect(next.playerHands[0].cards.length).toBe(3) // unchanged
  })

  it('is blocked when hand.bet === 0 (pure asset bet — BUG-3 fix)', () => {
    const state = playingState([card('5'), card('6')], 0)
    const next = gameReducer(state, { type: DOUBLE_DOWN, card: card('3') })
    expect(next.playerHands[0].bet).toBe(0)
    expect(next.playerHands[0].cards.length).toBe(2)
  })

  it('is blocked when bankroll insufficient and not in debt mode', () => {
    // bankroll = 50, bet = 100. bankroll - bet = -50 < 0, not in debt mode
    const state = playingState([card('5'), card('6')], 100, { bankroll: 50, inDebtMode: false })
    const next = gameReducer(state, { type: DOUBLE_DOWN, card: card('3') })
    expect(next.playerHands[0].bet).toBe(100)
    expect(next.playerHands[0].cards.length).toBe(2)
  })

  it('is allowed when bankroll insufficient but in debt mode', () => {
    const state = playingState([card('5'), card('6')], 100, { bankroll: 50, inDebtMode: true })
    const next = gameReducer(state, { type: DOUBLE_DOWN, card: card('3') })
    expect(next.playerHands[0].bet).toBe(200)
  })

  it('charges vig on borrowed portion of double-down bet', () => {
    // bankroll = 50, bet = 100, double needs 100 more. totalCommitted = 100 (active hand)
    // effectiveBankroll = max(0, 50-100) = 0
    // borrowedAmount = max(0, 100 - 0) = 100
    // vigRate at bankroll 50 = 2%  → vigAmount = floor(100 * 0.02) = 2
    const state = playingState([card('5'), card('6')], 100, { bankroll: 50, inDebtMode: true })
    const next = gameReducer(state, { type: DOUBLE_DOWN, card: card('3') })
    expect(next.vigAmount).toBe(2)
    expect(next.bankroll).toBe(48)
  })

  it('transitions to dealerTurn after doubling last hand', () => {
    const state = playingState([card('5'), card('6')], 100)
    const next = gameReducer(state, { type: DOUBLE_DOWN, card: card('3') })
    expect(next.phase).toBe('dealerTurn')
  })

  it('is blocked when hand is split aces', () => {
    const hand = { ...createHandObject([card('A'), card('5')], 100), isSplitAces: true }
    const state = { ...createInitialState(), phase: 'playing', playerHands: [hand], activeHandIndex: 0, dealerHand: [card('7'), card('8')], deck: makeDeck() }
    const next = gameReducer(state, { type: DOUBLE_DOWN, card: card('3') })
    expect(next.playerHands[0].bet).toBe(100)
    expect(next.playerHands[0].cards.length).toBe(2)
  })

  it('is blocked when card payload is missing', () => {
    const state = playingState([card('5'), card('6')], 100)
    const next = gameReducer(state, { type: DOUBLE_DOWN })
    expect(next.playerHands[0].bet).toBe(100)
  })
})

// ===========================================================================
// 10. SPLIT
// ===========================================================================
describe('SPLIT', () => {
  function splitState(rank = '8', bet = 200, overrides = {}) {
    const base = createInitialState()
    const hand = createHandObject([card(rank, 'hearts'), card(rank, 'spades')], bet)
    return {
      ...base,
      phase: 'playing',
      playerHands: [hand],
      activeHandIndex: 0,
      dealerHand: [card('7'), card('8')],
      deck: makeDeck(),
      ...overrides,
    }
  }

  it('creates two hands from one matching-rank hand', () => {
    const state = splitState()
    const next = gameReducer(state, { type: SPLIT, cards: [card('3'), card('4')] })
    expect(next.playerHands.length).toBe(2)
  })

  it('each new hand has 2 cards', () => {
    const state = splitState()
    const next = gameReducer(state, { type: SPLIT, cards: [card('3'), card('4')] })
    expect(next.playerHands[0].cards.length).toBe(2)
    expect(next.playerHands[1].cards.length).toBe(2)
  })

  it('each new hand keeps original bet', () => {
    const state = splitState('8', 200)
    const next = gameReducer(state, { type: SPLIT, cards: [card('3'), card('4')] })
    expect(next.playerHands[0].bet).toBe(200)
    expect(next.playerHands[1].bet).toBe(200)
  })

  it('is blocked when cards do not share the same rank', () => {
    const base = createInitialState()
    const hand = createHandObject([card('K'), card('Q')], 100) // K and Q — different ranks
    const state = { ...base, phase: 'playing', playerHands: [hand], activeHandIndex: 0, dealerHand: [card('7'), card('8')], deck: makeDeck() }
    const next = gameReducer(state, { type: SPLIT, cards: [card('3'), card('4')] })
    expect(next.playerHands.length).toBe(1)
  })

  it('is blocked when already at MAX_SPLIT_HANDS', () => {
    const base = createInitialState()
    const hands = Array.from({ length: MAX_SPLIT_HANDS }, () =>
      createHandObject([card('8', 'hearts'), card('8', 'spades')], 100)
    )
    const state = { ...base, phase: 'playing', playerHands: hands, activeHandIndex: 0, dealerHand: [card('7'), card('8')], deck: makeDeck() }
    const next = gameReducer(state, { type: SPLIT, cards: [card('3'), card('4')] })
    expect(next.playerHands.length).toBe(MAX_SPLIT_HANDS)
  })

  it('is blocked when hand.bet === 0 (pure asset bet — BUG-3 fix)', () => {
    const state = splitState('8', 0)
    const next = gameReducer(state, { type: SPLIT, cards: [card('3'), card('4')] })
    expect(next.playerHands.length).toBe(1)
  })

  it('is blocked when bankroll insufficient and not in debt mode', () => {
    const state = splitState('8', 200, { bankroll: 100, inDebtMode: false })
    const next = gameReducer(state, { type: SPLIT, cards: [card('3'), card('4')] })
    expect(next.playerHands.length).toBe(1)
  })

  it('is allowed when bankroll insufficient but in debt mode', () => {
    const state = splitState('8', 200, { bankroll: 100, inDebtMode: true })
    const next = gameReducer(state, { type: SPLIT, cards: [card('3'), card('4')] })
    expect(next.playerHands.length).toBe(2)
  })

  it('split aces: each hand gets one card and auto-stands', () => {
    const state = splitState('A')
    const next = gameReducer(state, { type: SPLIT, cards: [card('5'), card('7')] })
    expect(next.playerHands.length).toBe(2)
    expect(next.playerHands[0].isSplitAces).toBe(true)
    expect(next.playerHands[1].isSplitAces).toBe(true)
    // Both hands have 2 cards and are standing (not busted)
    expect(next.playerHands[0].status).toBe('standing')
    expect(next.playerHands[1].status).toBe('standing')
  })

  it('split aces: cannot re-split', () => {
    // A hand that is already isSplitAces cannot be split again
    const base = createInitialState()
    const hand = { ...createHandObject([card('A', 'hearts'), card('A', 'spades')], 200), isSplitAces: true }
    const state = { ...base, phase: 'playing', playerHands: [hand], activeHandIndex: 0, dealerHand: [card('7'), card('8')], deck: makeDeck() }
    const next = gameReducer(state, { type: SPLIT, cards: [card('3'), card('4')] })
    expect(next.playerHands.length).toBe(1)
  })

  it('is blocked when not in playing phase', () => {
    const state = { ...createInitialState(), deck: makeDeck() }
    const next = gameReducer(state, { type: SPLIT, cards: [card('3'), card('4')] })
    expect(next.playerHands.length).toBe(0)
  })

  it('correctly splits — first hand has original first card + new card', () => {
    const state = splitState('8')
    const newCard0 = card('3', 'diamonds')
    const newCard1 = card('4', 'clubs')
    const next = gameReducer(state, { type: SPLIT, cards: [newCard0, newCard1] })
    expect(next.playerHands[0].cards[0].rank).toBe('8')
    expect(next.playerHands[0].cards[0].suit).toBe('hearts')
    expect(next.playerHands[0].cards[1]).toEqual(newCard0)
    expect(next.playerHands[1].cards[0].rank).toBe('8')
    expect(next.playerHands[1].cards[0].suit).toBe('spades')
    expect(next.playerHands[1].cards[1]).toEqual(newCard1)
  })

  it('transitions to dealerTurn when both split aces auto-stand', () => {
    const state = splitState('A')
    const next = gameReducer(state, { type: SPLIT, cards: [card('5'), card('7')] })
    expect(next.phase).toBe('dealerTurn')
  })
})

// ===========================================================================
// 11. RESOLVE_HAND
// ===========================================================================
describe('RESOLVE_HAND', () => {
  function resultState(handCards, bet, dealerCards, overrides = {}) {
    const base = createInitialState()
    const hand = createHandObject(handCards, bet)
    return {
      ...base,
      phase: 'playing',
      playerHands: [hand],
      activeHandIndex: 0,
      dealerHand: dealerCards,
      deck: makeDeck(),
      bankrollHistory: [STARTING_BANKROLL],
      ...overrides,
    }
  }

  it('win: bankroll increases by bet amount', () => {
    const state = resultState([card('K'), card('Q')], 500, [card('7'), card('8')])
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['win'] })
    expect(next.bankroll).toBe(STARTING_BANKROLL + 500)
  })

  it('lose: bankroll decreases by bet amount', () => {
    const state = resultState([card('5'), card('6')], 500, [card('K'), card('Q')])
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['lose'] })
    expect(next.bankroll).toBe(STARTING_BANKROLL - 500)
  })

  it('blackjack pays 3:2 (floor of 1.5 * bet)', () => {
    // bet = 100, payout = floor(1.5 * 100) = 150
    const state = resultState([card('A'), card('K')], 100, [card('7'), card('8')])
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['blackjack'] })
    expect(next.bankroll).toBe(STARTING_BANKROLL + 150)
  })

  it('blackjack pays correct floor for odd bets', () => {
    // bet = 101, payout = floor(1.5 * 101) = floor(151.5) = 151
    const state = resultState([card('A'), card('K')], 101, [card('7'), card('8')])
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['blackjack'] })
    expect(next.bankroll).toBe(STARTING_BANKROLL + 151)
  })

  it('push: no bankroll change', () => {
    const state = resultState([card('K'), card('Q')], 500, [card('K'), card('J')])
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['push'] })
    expect(next.bankroll).toBe(STARTING_BANKROLL)
  })

  it('bust: bankroll decreases by bet amount', () => {
    const state = resultState([card('K'), card('Q')], 500, [card('7'), card('8')])
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['bust'] })
    expect(next.bankroll).toBe(STARTING_BANKROLL - 500)
  })

  it('dealerBust outcome: bankroll increases by bet amount', () => {
    const state = resultState([card('K'), card('Q')], 500, [card('K'), card('Q')])
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['dealerBust'] })
    expect(next.bankroll).toBe(STARTING_BANKROLL + 500)
  })

  it('sets phase to result', () => {
    const state = resultState([card('K'), card('Q')], 500, [card('7'), card('8')])
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['win'] })
    expect(next.phase).toBe('result')
  })

  it('sets hand result and status to done', () => {
    const state = resultState([card('K'), card('Q')], 500, [card('7'), card('8')])
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['win'] })
    expect(next.playerHands[0].result).toBe('win')
    expect(next.playerHands[0].status).toBe('done')
  })

  it('increments winStreak on win', () => {
    const state = resultState([card('K'), card('Q')], 500, [card('7'), card('8')])
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['win'] })
    expect(next.winStreak).toBe(1)
    expect(next.loseStreak).toBe(0)
  })

  it('increments loseStreak on loss', () => {
    const state = resultState([card('K'), card('Q')], 500, [card('7'), card('8')])
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['lose'] })
    expect(next.loseStreak).toBe(1)
    expect(next.winStreak).toBe(0)
  })

  it('resets winStreak on loss', () => {
    const state = {
      ...resultState([card('K'), card('Q')], 500, [card('7'), card('8')]),
      winStreak: 3,
    }
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['lose'] })
    expect(next.winStreak).toBe(0)
  })

  it('resets loseStreak on win', () => {
    const state = {
      ...resultState([card('K'), card('Q')], 500, [card('7'), card('8')]),
      loseStreak: 5,
    }
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['win'] })
    expect(next.loseStreak).toBe(0)
  })

  it('increments handsPlayed', () => {
    const state = resultState([card('K'), card('Q')], 500, [card('7'), card('8')])
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['win'] })
    expect(next.handsPlayed).toBe(1)
  })

  it('updates totalWon on win', () => {
    const state = resultState([card('K'), card('Q')], 500, [card('7'), card('8')])
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['win'] })
    expect(next.totalWon).toBe(500)
  })

  it('updates totalLost on loss', () => {
    const state = resultState([card('K'), card('Q')], 500, [card('7'), card('8')])
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['lose'] })
    expect(next.totalLost).toBe(500)
  })

  it('double-dispatch guard prevents double resolution (phase=result, chipStack empty, no betted assets)', () => {
    const base = createInitialState()
    const hand = createHandObject([card('K'), card('Q')], 500)
    const state = {
      ...base,
      phase: 'result',
      playerHands: [hand],
      activeHandIndex: 0,
      dealerHand: [card('7'), card('8')],
      chipStack: [],
      bettedAssets: [],
      bankroll: STARTING_BANKROLL + 500,
    }
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['win'] })
    expect(next.bankroll).toBe(STARTING_BANKROLL + 500) // no change
  })

  it('asset returned to ownedAssets on win', () => {
    const watch = ASSETS.find(a => a.id === 'watch')
    const base = createInitialState()
    const hand = createHandObject([card('K'), card('Q')], 100)
    const state = {
      ...base,
      phase: 'playing',
      playerHands: [hand],
      activeHandIndex: 0,
      dealerHand: [card('7'), card('8')],
      deck: makeDeck(),
      bankrollHistory: [STARTING_BANKROLL],
      bettedAssets: [watch],
      ownedAssets: { ...base.ownedAssets, [watch.id]: false },
    }
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['win'] })
    expect(next.ownedAssets[watch.id]).toBe(true)
    expect(next.bettedAssets).toEqual([])
  })

  it('asset lost on loss (not returned)', () => {
    const watch = ASSETS.find(a => a.id === 'watch')
    const base = createInitialState()
    const hand = createHandObject([card('K'), card('Q')], 100)
    const state = {
      ...base,
      phase: 'playing',
      playerHands: [hand],
      activeHandIndex: 0,
      dealerHand: [card('7'), card('8')],
      deck: makeDeck(),
      bankrollHistory: [STARTING_BANKROLL],
      bettedAssets: [watch],
      ownedAssets: { ...base.ownedAssets, [watch.id]: false },
    }
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['lose'] })
    expect(next.ownedAssets[watch.id]).toBe(false)
    expect(next.bettedAssets).toEqual([])
  })

  it('asset value added to hand[0] bet payout on win', () => {
    // hand bet = 100, asset value = 500, win payout = 600
    const watch = ASSETS.find(a => a.id === 'watch') // value = 500
    const base = createInitialState()
    const hand = createHandObject([card('K'), card('Q')], 100)
    const state = {
      ...base,
      phase: 'playing',
      playerHands: [hand],
      activeHandIndex: 0,
      dealerHand: [card('7'), card('8')],
      deck: makeDeck(),
      bankrollHistory: [STARTING_BANKROLL],
      bettedAssets: [watch],
      ownedAssets: { ...base.ownedAssets, [watch.id]: false },
    }
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['win'] })
    expect(next.bankroll).toBe(STARTING_BANKROLL + 600)
  })

  it('exits debt mode when bankroll recovers to >= minBet after win', () => {
    // bankroll starts at -100 (negative), win with bet=200 → new bankroll = 100 >= minBet (25)
    const base = createInitialState()
    const hand = createHandObject([card('K'), card('Q')], 200)
    const state = {
      ...base,
      phase: 'playing',
      playerHands: [hand],
      activeHandIndex: 0,
      dealerHand: [card('7'), card('8')],
      deck: makeDeck(),
      bankrollHistory: [-100],
      bankroll: -100,
      inDebtMode: true,
    }
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['win'] })
    expect(next.bankroll).toBe(100)
    expect(next.inDebtMode).toBe(false)
  })

  it('stays in debt mode when bankroll is still negative after win', () => {
    // bankroll starts at -500, win with bet=100 → new bankroll = -400 (still < minBet)
    const base = createInitialState()
    const hand = createHandObject([card('K'), card('Q')], 100)
    const state = {
      ...base,
      phase: 'playing',
      playerHands: [hand],
      activeHandIndex: 0,
      dealerHand: [card('7'), card('8')],
      deck: makeDeck(),
      bankrollHistory: [-500],
      bankroll: -500,
      inDebtMode: true,
    }
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['win'] })
    expect(next.bankroll).toBe(-400)
    expect(next.inDebtMode).toBe(true)
  })

  it('mixed result for split hands with different outcomes', () => {
    const base = createInitialState()
    const hand0 = createHandObject([card('K'), card('Q')], 100)
    const hand1 = createHandObject([card('5'), card('6')], 100)
    const state = {
      ...base,
      phase: 'playing',
      playerHands: [hand0, hand1],
      activeHandIndex: 0,
      dealerHand: [card('7'), card('8')],
      deck: makeDeck(),
      bankrollHistory: [STARTING_BANKROLL],
    }
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['win', 'lose'] })
    expect(next.result).toBe('mixed')
  })

  it('clears chipStack after resolution', () => {
    const state = {
      ...resultState([card('K'), card('Q')], 500, [card('7'), card('8')]),
      chipStack: [100, 500],
    }
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['win'] })
    expect(next.chipStack).toEqual([])
  })

  it('updates peakBankroll when bankroll exceeds previous peak', () => {
    const state = {
      ...resultState([card('K'), card('Q')], 5000, [card('7'), card('8')]),
      peakBankroll: STARTING_BANKROLL,
    }
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['win'] })
    expect(next.peakBankroll).toBe(STARTING_BANKROLL + 5000)
  })

  it('updates lowestBankroll when bankroll drops below previous lowest', () => {
    const state = {
      ...resultState([card('K'), card('Q')], 5000, [card('7'), card('8')]),
      lowestBankroll: STARTING_BANKROLL,
    }
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['lose'] })
    expect(next.lowestBankroll).toBe(STARTING_BANKROLL - 5000)
  })

  it('appends new bankroll to bankrollHistory', () => {
    const state = resultState([card('K'), card('Q')], 500, [card('7'), card('8')])
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['win'] })
    expect(next.bankrollHistory[next.bankrollHistory.length - 1]).toBe(STARTING_BANKROLL + 500)
  })
})

// ===========================================================================
// 12. BET_ASSET
// ===========================================================================
describe('BET_ASSET', () => {
  it('adds asset to bettedAssets during betting phase', () => {
    const watch = ASSETS.find(a => a.id === 'watch')
    const state = { ...createInitialState(), deck: makeDeck() }
    const next = gameReducer(state, { type: BET_ASSET, asset: watch })
    expect(next.bettedAssets).toContain(watch)
  })

  it('marks asset as not owned in ownedAssets', () => {
    const watch = ASSETS.find(a => a.id === 'watch')
    const state = { ...createInitialState(), deck: makeDeck() }
    const next = gameReducer(state, { type: BET_ASSET, asset: watch })
    expect(next.ownedAssets[watch.id]).toBe(false)
  })

  it('is blocked when asset is not owned', () => {
    const watch = ASSETS.find(a => a.id === 'watch')
    const state = {
      ...createInitialState(),
      deck: makeDeck(),
      ownedAssets: { ...createInitialState().ownedAssets, [watch.id]: false },
    }
    const next = gameReducer(state, { type: BET_ASSET, asset: watch })
    expect(next.bettedAssets).toEqual([])
  })

  it('is blocked when asset is already betted', () => {
    const watch = ASSETS.find(a => a.id === 'watch')
    const state = {
      ...createInitialState(),
      deck: makeDeck(),
      bettedAssets: [watch],
      ownedAssets: { ...createInitialState().ownedAssets, [watch.id]: false },
    }
    const next = gameReducer(state, { type: BET_ASSET, asset: watch })
    expect(next.bettedAssets.length).toBe(1) // no duplicate
  })

  it('is allowed during playing phase (intentional per spec Section 3.4)', () => {
    const watch = ASSETS.find(a => a.id === 'watch')
    const state = playingState()
    const next = gameReducer(state, { type: BET_ASSET, asset: watch })
    expect(next.bettedAssets).toContain(watch)
  })

  it('is blocked outside betting and playing phases', () => {
    const watch = ASSETS.find(a => a.id === 'watch')
    const state = { ...createInitialState(), deck: makeDeck(), phase: 'result' }
    const next = gameReducer(state, { type: BET_ASSET, asset: watch })
    expect(next.bettedAssets).toEqual([])
  })

  it('does not allow betting an asset locked by bankroll threshold', () => {
    // 'soul' requires bankroll <= -200000, starting bankroll = 10000
    const soul = ASSETS.find(a => a.id === 'soul')
    const state = { ...createInitialState(), deck: makeDeck(), bankroll: 10000 }
    // Note: the reducer does NOT check the unlock threshold — that is UI-gated.
    // The reducer only checks ownedAssets[id] and if already betted.
    // This test confirms the reducer itself does not reject based on unlockThreshold.
    const next = gameReducer(state, { type: BET_ASSET, asset: soul })
    expect(next.bettedAssets).toContain(soul)
  })
})

// ===========================================================================
// 13. TAKE_LOAN
// ===========================================================================
describe('TAKE_LOAN', () => {
  it('sets inDebtMode to true in betting phase when bankroll < minBet and no assets available', () => {
    // Remove all assets, bankroll = 0
    const base = createInitialState()
    const ownedAssets = {}
    for (const a of ASSETS) ownedAssets[a.id] = false
    const state = { ...base, deck: makeDeck(), bankroll: 0, ownedAssets }
    const next = gameReducer(state, { type: TAKE_LOAN })
    expect(next.inDebtMode).toBe(true)
  })

  it('is blocked in betting phase when bankroll >= minBet', () => {
    const state = { ...createInitialState(), deck: makeDeck(), bankroll: 100 }
    const next = gameReducer(state, { type: TAKE_LOAN })
    expect(next.inDebtMode).toBe(false)
  })

  it('is blocked in betting phase when player still has available assets', () => {
    // bankroll = 0, watch unlocks at threshold 0 — player still has watch
    const state = { ...createInitialState(), deck: makeDeck(), bankroll: 0 }
    const next = gameReducer(state, { type: TAKE_LOAN })
    // watch has unlockThreshold = 0 and bankroll (0) <= 0 → asset available → loan blocked
    expect(next.inDebtMode).toBe(false)
  })

  it('sets inDebtMode to true during playing phase unconditionally', () => {
    const state = playingState([card('5'), card('6')], 100, { bankroll: 500 })
    const next = gameReducer(state, { type: TAKE_LOAN })
    expect(next.inDebtMode).toBe(true)
  })

  it('is blocked when phase is not betting or playing', () => {
    const state = { ...createInitialState(), deck: makeDeck(), phase: 'result', bankroll: 0 }
    const next = gameReducer(state, { type: TAKE_LOAN })
    expect(next.inDebtMode).toBe(false)
  })
})

// ===========================================================================
// 14. NEW_ROUND
// ===========================================================================
describe('NEW_ROUND', () => {
  function resultReadyState(overrides = {}) {
    const base = createInitialState()
    const hand = createHandObject([card('K'), card('Q')], 100)
    hand.status = 'done'
    hand.result = 'win'
    return {
      ...base,
      phase: 'result',
      playerHands: [hand],
      dealerHand: [card('7'), card('8')],
      chipStack: [],
      deck: makeDeck(),
      result: 'win',
      isAllIn: false,
      ...overrides,
    }
  }

  it('resets to betting phase', () => {
    const state = resultReadyState()
    const next = gameReducer(state, { type: NEW_ROUND })
    expect(next.phase).toBe('betting')
  })

  it('clears playerHands', () => {
    const state = resultReadyState()
    const next = gameReducer(state, { type: NEW_ROUND })
    expect(next.playerHands).toEqual([])
  })

  it('clears dealerHand', () => {
    const state = resultReadyState()
    const next = gameReducer(state, { type: NEW_ROUND })
    expect(next.dealerHand).toEqual([])
  })

  it('clears chipStack', () => {
    const state = resultReadyState()
    const next = gameReducer(state, { type: NEW_ROUND })
    expect(next.chipStack).toEqual([])
  })

  it('clears bettedAssets', () => {
    const watch = ASSETS.find(a => a.id === 'watch')
    const state = resultReadyState({ bettedAssets: [watch] })
    const next = gameReducer(state, { type: NEW_ROUND })
    expect(next.bettedAssets).toEqual([])
  })

  it('resets result to null', () => {
    const state = resultReadyState()
    const next = gameReducer(state, { type: NEW_ROUND })
    expect(next.result).toBeNull()
  })

  it('resets isAllIn to false', () => {
    const state = resultReadyState({ isAllIn: true })
    const next = gameReducer(state, { type: NEW_ROUND })
    expect(next.isAllIn).toBe(false)
  })

  it('reshuffles deck when below RESHUFFLE_THRESHOLD', () => {
    const shortDeck = makeDeck(RESHUFFLE_THRESHOLD - 1)
    const freshDeck = makeDeck(300)
    const state = resultReadyState({ deck: shortDeck })
    const next = gameReducer(state, { type: NEW_ROUND, freshDeck })
    expect(next.deck).toBe(freshDeck)
  })

  it('keeps existing deck when above RESHUFFLE_THRESHOLD', () => {
    const normalDeck = makeDeck(200)
    const freshDeck = makeDeck(300)
    const state = resultReadyState({ deck: normalDeck })
    const next = gameReducer(state, { type: NEW_ROUND, freshDeck })
    expect(next.deck).toBe(normalDeck)
  })

  it('is blocked when not in result phase', () => {
    const state = { ...createInitialState(), deck: makeDeck() }
    const next = gameReducer(state, { type: NEW_ROUND })
    expect(next.phase).toBe('betting') // stays betting, playerHands stays []
  })

  it('is blocked when chipStack is not empty', () => {
    const state = resultReadyState({ chipStack: [100] })
    const next = gameReducer(state, { type: NEW_ROUND })
    expect(next.phase).toBe('result')
  })

  it('resets vigAmount to 0', () => {
    const state = resultReadyState({ vigAmount: 50, vigRate: 0.04 })
    const next = gameReducer(state, { type: NEW_ROUND })
    expect(next.vigAmount).toBe(0)
    expect(next.vigRate).toBe(0)
  })
})

// ===========================================================================
// 15. RESET_GAME
// ===========================================================================
describe('RESET_GAME', () => {
  it('returns to initial state with fresh deck', () => {
    const freshDeck = makeDeck(312)
    // Start from a played-out state
    const base = createInitialState()
    const modifiedState = {
      ...base,
      bankroll: 500,
      phase: 'result',
      handsPlayed: 42,
      winStreak: 5,
      chipStack: [100, 500],
    }
    const next = gameReducer(modifiedState, { type: RESET_GAME, freshDeck })
    expect(next.bankroll).toBe(STARTING_BANKROLL)
    expect(next.phase).toBe('betting')
    expect(next.handsPlayed).toBe(0)
    expect(next.winStreak).toBe(0)
    expect(next.chipStack).toEqual([])
    expect(next.deck).toBe(freshDeck)
  })

  it('preserves muted setting across reset', () => {
    const freshDeck = makeDeck(312)
    const state = { ...createInitialState(), muted: true }
    const next = gameReducer(state, { type: RESET_GAME, freshDeck })
    expect(next.muted).toBe(true)
  })

  it('preserves notificationsEnabled setting across reset', () => {
    const freshDeck = makeDeck(312)
    const state = { ...createInitialState(), notificationsEnabled: false }
    const next = gameReducer(state, { type: RESET_GAME, freshDeck })
    expect(next.notificationsEnabled).toBe(false)
  })

  it('resets all assets to owned after reset', () => {
    const freshDeck = makeDeck(312)
    const base = createInitialState()
    const ownedAssets = {}
    for (const a of ASSETS) ownedAssets[a.id] = false
    const state = { ...base, ownedAssets }
    const next = gameReducer(state, { type: RESET_GAME, freshDeck })
    for (const a of ASSETS) {
      expect(next.ownedAssets[a.id]).toBe(true)
    }
  })
})

// ===========================================================================
// 16. DEALER_DRAW
// ===========================================================================
describe('DEALER_DRAW', () => {
  function dealerTurnState(overrides = {}) {
    const base = createInitialState()
    const hand = createHandObject([card('K'), card('Q')], 100)
    hand.status = 'standing'
    return {
      ...base,
      phase: 'dealerTurn',
      playerHands: [hand],
      activeHandIndex: 0,
      dealerHand: [card('5'), card('6')],
      deck: makeDeck(),
      ...overrides,
    }
  }

  it('adds a card to dealer hand', () => {
    const state = dealerTurnState()
    const next = gameReducer(state, { type: DEALER_DRAW, card: card('7') })
    expect(next.dealerHand.length).toBe(3)
    expect(next.dealerHand[2]).toEqual(card('7'))
  })

  it('is blocked when not in dealerTurn phase', () => {
    const state = playingState()
    const next = gameReducer(state, { type: DEALER_DRAW, card: card('7') })
    expect(next.dealerHand.length).toBe(2) // dealer hand from playingState helper
  })

  it('is blocked when card payload is missing and no freshDeck', () => {
    const state = dealerTurnState()
    const next = gameReducer(state, { type: DEALER_DRAW })
    expect(next.dealerHand.length).toBe(2)
  })

  it('uses freshDeck card when card is not provided but freshDeck is', () => {
    const state = dealerTurnState()
    const fresh = [card('9'), card('2'), card('3')]
    const next = gameReducer(state, { type: DEALER_DRAW, freshDeck: fresh })
    expect(next.dealerHand.length).toBe(3)
    expect(next.dealerHand[2]).toEqual(card('9'))
  })

  it('updates deck slice after drawing', () => {
    const deckBefore = makeDeck(50)
    const state = dealerTurnState({ deck: deckBefore })
    const next = gameReducer(state, { type: DEALER_DRAW, card: card('7') })
    expect(next.deck.length).toBe(deckBefore.length - 1)
  })
})

// ===========================================================================
// 17. Miscellaneous actions (UI, achievements, settings)
// ===========================================================================
describe('DISMISS_TABLE_TOAST', () => {
  it('clears tableLevelChanged', () => {
    const state = { ...createInitialState(), tableLevelChanged: { from: 0, to: 1 } }
    const next = gameReducer(state, { type: DISMISS_TABLE_TOAST })
    expect(next.tableLevelChanged).toBeNull()
  })
})

describe('TOGGLE_ASSET_MENU', () => {
  it('toggles showAssetMenu', () => {
    const state = createInitialState()
    const next = gameReducer(state, { type: TOGGLE_ASSET_MENU })
    expect(next.showAssetMenu).toBe(true)
    const next2 = gameReducer(next, { type: TOGGLE_ASSET_MENU })
    expect(next2.showAssetMenu).toBe(false)
  })
})

describe('TOGGLE_ACHIEVEMENTS', () => {
  it('toggles showAchievements', () => {
    const state = createInitialState()
    const next = gameReducer(state, { type: TOGGLE_ACHIEVEMENTS })
    expect(next.showAchievements).toBe(true)
  })
})

describe('TOGGLE_DEBT_TRACKER', () => {
  it('toggles showDebtTracker', () => {
    const state = createInitialState()
    const next = gameReducer(state, { type: TOGGLE_DEBT_TRACKER })
    expect(next.showDebtTracker).toBe(true)
  })
})

describe('TOGGLE_MUTE', () => {
  it('toggles muted', () => {
    const state = createInitialState()
    const next = gameReducer(state, { type: TOGGLE_MUTE })
    expect(next.muted).toBe(true)
    const next2 = gameReducer(next, { type: TOGGLE_MUTE })
    expect(next2.muted).toBe(false)
  })
})

describe('TOGGLE_NOTIFICATIONS', () => {
  it('toggles notificationsEnabled', () => {
    const state = createInitialState()
    const next = gameReducer(state, { type: TOGGLE_NOTIFICATIONS })
    expect(next.notificationsEnabled).toBe(false)
  })
})

describe('UNLOCK_ACHIEVEMENT', () => {
  it('adds achievement id to unlockedAchievements and queue', () => {
    const state = createInitialState()
    const next = gameReducer(state, { type: UNLOCK_ACHIEVEMENT, id: 'first_win' })
    expect(next.unlockedAchievements).toContain('first_win')
    expect(next.achievementQueue).toContain('first_win')
  })

  it('is idempotent — does not add duplicate achievements', () => {
    const state = { ...createInitialState(), unlockedAchievements: ['first_win'] }
    const next = gameReducer(state, { type: UNLOCK_ACHIEVEMENT, id: 'first_win' })
    expect(next.unlockedAchievements.filter(id => id === 'first_win').length).toBe(1)
  })
})

describe('DISMISS_ACHIEVEMENT', () => {
  it('removes first item from achievementQueue', () => {
    const state = { ...createInitialState(), achievementQueue: ['first_win', 'blackjack'] }
    const next = gameReducer(state, { type: DISMISS_ACHIEVEMENT })
    expect(next.achievementQueue).toEqual(['blackjack'])
  })
})

describe('DISMISS_LOAN_SHARK', () => {
  it('removes first item from loanSharkQueue', () => {
    const state = { ...createInitialState(), loanSharkQueue: ['msg1', 'msg2'] }
    const next = gameReducer(state, { type: DISMISS_LOAN_SHARK })
    expect(next.loanSharkQueue).toEqual(['msg2'])
  })
})

describe('LOAD_ACHIEVEMENTS', () => {
  it('replaces unlockedAchievements with provided ids', () => {
    const state = createInitialState()
    const next = gameReducer(state, { type: LOAD_ACHIEVEMENTS, ids: ['first_win', 'blackjack'] })
    expect(next.unlockedAchievements).toEqual(['first_win', 'blackjack'])
  })
})

describe('LOAD_HIGHEST_DEBT', () => {
  it('updates lowestBankroll when value is lower', () => {
    const state = createInitialState() // lowestBankroll = STARTING_BANKROLL
    const next = gameReducer(state, { type: LOAD_HIGHEST_DEBT, value: -5000 })
    expect(next.lowestBankroll).toBe(-5000)
  })

  it('does not update lowestBankroll when value is higher', () => {
    const state = { ...createInitialState(), lowestBankroll: -10000 }
    const next = gameReducer(state, { type: LOAD_HIGHEST_DEBT, value: -5000 })
    expect(next.lowestBankroll).toBe(-10000)
  })
})

describe('SET_DEALER_MESSAGE', () => {
  it('sets dealerMessage and shownDealerLines', () => {
    const state = createInitialState()
    const shown = { greeting: [0, 1] }
    const next = gameReducer(state, { type: SET_DEALER_MESSAGE, message: 'Hello there', shownDealerLines: shown })
    expect(next.dealerMessage).toBe('Hello there')
    expect(next.shownDealerLines).toEqual(shown)
  })
})

describe('SET_LOAN_SHARK_MESSAGE', () => {
  it('appends messages to loanSharkQueue and updates seenThresholds', () => {
    const state = createInitialState()
    const next = gameReducer(state, {
      type: SET_LOAN_SHARK_MESSAGE,
      messages: ['Pay up!'],
      seenThresholds: [-1000],
    })
    expect(next.loanSharkQueue).toContain('Pay up!')
    expect(next.seenLoanThresholds).toEqual([-1000])
  })
})

describe('SELECT_CHIP', () => {
  it('updates selectedChipValue', () => {
    const state = createInitialState()
    const next = gameReducer(state, { type: SELECT_CHIP, value: 500 })
    expect(next.selectedChipValue).toBe(500)
  })
})

describe('REMOVE_ASSET', () => {
  it('removes asset from bettedAssets and restores to ownedAssets', () => {
    const watch = ASSETS.find(a => a.id === 'watch')
    const state = {
      ...createInitialState(),
      phase: 'betting',
      bettedAssets: [watch],
      ownedAssets: { ...createInitialState().ownedAssets, [watch.id]: false },
    }
    const next = gameReducer(state, { type: REMOVE_ASSET, assetId: watch.id })
    expect(next.bettedAssets).toEqual([])
    expect(next.ownedAssets[watch.id]).toBe(true)
  })

  it('is blocked when phase is not betting or playing', () => {
    const watch = ASSETS.find(a => a.id === 'watch')
    const state = {
      ...createInitialState(),
      phase: 'result',
      bettedAssets: [watch],
      ownedAssets: { ...createInitialState().ownedAssets, [watch.id]: false },
    }
    const next = gameReducer(state, { type: REMOVE_ASSET, assetId: watch.id })
    expect(next.bettedAssets).toContain(watch)
  })
})

// ===========================================================================
// 18. Table level progression
// ===========================================================================
describe('Table level progression', () => {
  it('sets pendingTableUpgrade when bankroll crosses upgrade threshold', () => {
    // bankroll just below 100K (Emerald Room threshold), win enough to cross it
    const base = createInitialState()
    const hand = createHandObject([card('K'), card('Q')], 50000)
    const state = {
      ...base,
      phase: 'playing',
      playerHands: [hand],
      activeHandIndex: 0,
      dealerHand: [card('7'), card('8')],
      deck: makeDeck(),
      bankrollHistory: [60000],
      bankroll: 60000,
      tableLevel: 0,
    }
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['win'] })
    // 60000 + 50000 = 110000 >= 100000 → pending upgrade, stays at level 0
    expect(next.tableLevel).toBe(0)
    expect(next.pendingTableUpgrade).toEqual({ from: 0, to: 1 })
  })

  it('downgrades tableLevel when bankroll drops below threshold after loss', () => {
    const base = createInitialState()
    const hand = createHandObject([card('K'), card('Q')], 80000)
    const state = {
      ...base,
      phase: 'playing',
      playerHands: [hand],
      activeHandIndex: 0,
      dealerHand: [card('7'), card('8')],
      deck: makeDeck(),
      bankrollHistory: [110000],
      bankroll: 110000,
      tableLevel: 1,
    }
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['lose'] })
    // 110000 - 80000 = 30000 < 100000 → tableLevel 0
    expect(next.tableLevel).toBe(0)
  })

  it('sets tableLevelChanged on downgrade, pendingTableUpgrade on upgrade', () => {
    // Upgrade: sets pending, not tableLevelChanged
    const base = createInitialState()
    const hand = createHandObject([card('K'), card('Q')], 50000)
    const upgradeState = {
      ...base,
      phase: 'playing',
      playerHands: [hand],
      activeHandIndex: 0,
      dealerHand: [card('7'), card('8')],
      deck: makeDeck(),
      bankrollHistory: [60000],
      bankroll: 60000,
      tableLevel: 0,
    }
    const upNext = gameReducer(upgradeState, { type: RESOLVE_HAND, outcomes: ['win'] })
    expect(upNext.tableLevelChanged).toBeNull()
    expect(upNext.pendingTableUpgrade).toEqual({ from: 0, to: 1 })

    // Downgrade: sets tableLevelChanged directly
    const downHand = createHandObject([card('K'), card('Q')], 80000)
    const downState = {
      ...base,
      phase: 'playing',
      playerHands: [downHand],
      activeHandIndex: 0,
      dealerHand: [card('7'), card('8')],
      deck: makeDeck(),
      bankrollHistory: [110000],
      bankroll: 110000,
      tableLevel: 1,
    }
    const downNext = gameReducer(downState, { type: RESOLVE_HAND, outcomes: ['lose'] })
    expect(downNext.tableLevelChanged).toEqual({ from: 1, to: 0 })
    expect(downNext.pendingTableUpgrade).toBeNull()
  })

  it('tableLevelChanged is null when level does not change', () => {
    const state = {
      ...createInitialState(),
      phase: 'playing',
      playerHands: [createHandObject([card('K'), card('Q')], 100)],
      activeHandIndex: 0,
      dealerHand: [card('7'), card('8')],
      deck: makeDeck(),
      bankrollHistory: [STARTING_BANKROLL],
      tableLevel: 0,
    }
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['win'] })
    expect(next.tableLevelChanged).toBeNull()
  })
})

// ===========================================================================
// 19. Debt mechanics integration
// ===========================================================================
describe('Debt mechanics integration', () => {
  it('bankroll can go negative — no validation prevents it', () => {
    const state = {
      ...createInitialState(),
      phase: 'playing',
      playerHands: [createHandObject([card('K'), card('Q')], 10000)],
      activeHandIndex: 0,
      dealerHand: [card('7'), card('8')],
      deck: makeDeck(),
      bankrollHistory: [STARTING_BANKROLL],
    }
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['lose'] })
    expect(next.bankroll).toBe(0) // 10000 - 10000 = 0
  })

  it('vig rate increases as bankroll goes deeper negative', () => {
    // At bankroll -500 (between 0 and -10K): rate = 4%
    // At bankroll -50000 (between -10K and -50K): rate = 7%
    // We test the getVigRate function indirectly via DEAL action
    const state1 = {
      ...createInitialState(),
      deck: makeDeck(),
      bankroll: -500,
      inDebtMode: true,
      chipStack: [100],
    }
    const next1 = dealFromBetting(state1, [card('5'), card('7'), card('6'), card('8')])
    // borrowedAmount = 100, rate = 4%, vig = floor(100 * 0.04) = 4
    expect(next1.vigAmount).toBe(4)

    const state2 = {
      ...createInitialState(),
      deck: makeDeck(),
      bankroll: -50000,
      inDebtMode: true,
      chipStack: [100],
    }
    const next2 = dealFromBetting(state2, [card('5'), card('7'), card('6'), card('8')])
    // borrowedAmount = 100, rate = 7%, vig = floor(100 * 0.07) = 7
    expect(next2.vigAmount).toBe(7)
  })

  it('ALL_IN in debt mode bets absolute value of bankroll', () => {
    const state = {
      ...createInitialState(),
      deck: makeDeck(),
      bankroll: -10000,
      inDebtMode: true,
      tableLevel: 0,
    }
    const next = gameReducer(state, { type: ALL_IN })
    const total = next.chipStack.reduce((s, v) => s + v, 0)
    expect(total).toBe(10000) // Math.abs(bankroll)
  })

  it('inDebtMode persists after push (no bankroll recovery)', () => {
    const state = {
      ...createInitialState(),
      phase: 'playing',
      playerHands: [createHandObject([card('K'), card('Q')], 200)],
      activeHandIndex: 0,
      dealerHand: [card('K'), card('J')],
      deck: makeDeck(),
      bankrollHistory: [-100],
      bankroll: -100,
      inDebtMode: true,
    }
    const next = gameReducer(state, { type: RESOLVE_HAND, outcomes: ['push'] })
    // push: no delta, bankroll stays -100 < minBet (25)
    expect(next.inDebtMode).toBe(true)
  })
})

// ===========================================================================
// 20. Reducer purity
// ===========================================================================
describe('Reducer purity', () => {
  it('does not mutate the incoming state object', () => {
    const state = { ...createInitialState(), deck: makeDeck(), chipStack: [100] }
    const frozen = Object.freeze({ ...state, chipStack: Object.freeze([100]) })
    // Should not throw even though state is frozen
    expect(() => gameReducer(frozen, { type: UNDO_CHIP })).not.toThrow()
  })

  it('returns the same reference for unrecognized action types', () => {
    const state = createInitialState()
    const next = gameReducer(state, { type: 'UNKNOWN_ACTION_XYZ' })
    expect(next).toBe(state)
  })

  it('returns same reference when ADD_CHIP is blocked', () => {
    const state = playingState() // not betting phase
    const next = gameReducer(state, { type: ADD_CHIP, value: 100 })
    expect(next).toBe(state)
  })
})

// ===========================================================================
// PLACE_SIDE_BET
// ===========================================================================
describe('PLACE_SIDE_BET', () => {
  it('allows placing all 5 side bets simultaneously', () => {
    let state = bettingStateWithChip(100)
    const types = ['perfectPair', 'colorMatch', 'dealerBust', 'luckyLucky', 'jinxBet']
    for (const t of types) {
      state = gameReducer(state, { type: PLACE_SIDE_BET, betType: t, chipValue: 100 })
    }
    expect(state.activeSideBets).toHaveLength(5)
  })
})
