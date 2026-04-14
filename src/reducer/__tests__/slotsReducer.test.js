import { describe, it, expect } from 'vitest'
import { slotsReducer } from '../slotsReducer'
import { createSlotsInitialState } from '../slotsInitialState'
import {
  SLOTS_SET_BET,
  SLOTS_SPIN,
  SLOTS_REEL_STOP,
  SLOTS_RESOLVE,
  SLOTS_NEW_ROUND,
  SLOTS_RESET,
  SLOTS_TOGGLE_MUTE,
  slotsSetBet,
  slotsSpin,
  slotsReelStop,
  slotsResolve,
  slotsReset,
} from '../slotsActions'
import { SLOT_SYMBOLS } from '../../constants/slotSymbols'

const CHERRY = SLOT_SYMBOLS[0]   // value: 5
const LEMON = SLOT_SYMBOLS[1]    // value: 10
const ORANGE = SLOT_SYMBOLS[2]   // value: 15
const BELL = SLOT_SYMBOLS[3]     // value: 25
const DIAMOND = SLOT_SYMBOLS[4]  // value: 50
const SEVEN = SLOT_SYMBOLS[5]    // value: 100
const JACKPOT = SLOT_SYMBOLS[6]  // value: 250

function slotsState(overrides = {}) {
  return { ...createSlotsInitialState(), ...overrides }
}

function spinningState(reels = [CHERRY, CHERRY, CHERRY], bet = 100, overrides = {}) {
  return slotsState({
    phase: 'spinning',
    reels,
    reelStops: [false, false, false],
    betAmount: bet,
    bankroll: 10000 - bet,
    spinsPlayed: 1,
    totalWagered: bet,
    ...overrides,
  })
}

function resultState(overrides = {}) {
  return slotsState({ phase: 'result', ...overrides })
}

// --- createSlotsInitialState ---

describe('createSlotsInitialState', () => {
  it('returns correct bankroll', () => {
    expect(createSlotsInitialState().bankroll).toBe(10000)
  })

  it('starts in betting phase', () => {
    expect(createSlotsInitialState().phase).toBe('betting')
  })

  it('starts with betAmount of 100', () => {
    expect(createSlotsInitialState().betAmount).toBe(100)
  })

  it('starts with null reels', () => {
    expect(createSlotsInitialState().reels).toEqual([null, null, null])
  })

  it('starts with all stats at 0', () => {
    const s = createSlotsInitialState()
    expect(s.spinsPlayed).toBe(0)
    expect(s.totalWagered).toBe(0)
    expect(s.totalWon).toBe(0)
    expect(s.totalLost).toBe(0)
    expect(s.biggestWin).toBe(0)
    expect(s.tripleCount).toBe(0)
    expect(s.jackpotCount).toBe(0)
  })

  it('starts with muted false', () => {
    expect(createSlotsInitialState().muted).toBe(false)
  })
})

// --- SLOTS_SET_BET ---

describe('SLOTS_SET_BET', () => {
  it('sets betAmount', () => {
    const s = slotsReducer(slotsState(), slotsSetBet(500))
    expect(s.betAmount).toBe(500)
  })

  it('clamps to bankroll when amount exceeds it', () => {
    const s = slotsReducer(slotsState({ bankroll: 200 }), slotsSetBet(500))
    expect(s.betAmount).toBe(200)
  })

  it('clamps minimum to 1', () => {
    const s = slotsReducer(slotsState(), slotsSetBet(0))
    expect(s.betAmount).toBe(1)
  })

  it('clamps negative to 1', () => {
    const s = slotsReducer(slotsState(), slotsSetBet(-50))
    expect(s.betAmount).toBe(1)
  })

  it('floors fractional amounts', () => {
    const s = slotsReducer(slotsState(), slotsSetBet(99.7))
    expect(s.betAmount).toBe(99)
  })

  it('blocked when not in betting phase', () => {
    const s = spinningState()
    expect(slotsReducer(s, slotsSetBet(500))).toBe(s)
  })

  it('returns same state when amount unchanged', () => {
    const s = slotsState({ betAmount: 100 })
    expect(slotsReducer(s, slotsSetBet(100))).toBe(s)
  })

  it('allows setting to 1', () => {
    const s = slotsReducer(slotsState(), slotsSetBet(1))
    expect(s.betAmount).toBe(1)
  })

  it('allows setting to exact bankroll', () => {
    const s = slotsReducer(slotsState({ bankroll: 5000 }), slotsSetBet(5000))
    expect(s.betAmount).toBe(5000)
  })
})

// --- SLOTS_SPIN ---

describe('SLOTS_SPIN', () => {
  const reels = [CHERRY, LEMON, ORANGE]

  it('transitions phase to spinning', () => {
    const s = slotsState({ betAmount: 100 })
    const next = slotsReducer(s, slotsSpin(reels))
    expect(next.phase).toBe('spinning')
  })

  it('stores reels from action payload', () => {
    const s = slotsState({ betAmount: 100 })
    const next = slotsReducer(s, slotsSpin(reels))
    expect(next.reels).toEqual(reels)
  })

  it('deducts betAmount from bankroll', () => {
    const s = slotsState({ bankroll: 10000, betAmount: 500 })
    const next = slotsReducer(s, slotsSpin(reels))
    expect(next.bankroll).toBe(9500)
  })

  it('increments spinsPlayed', () => {
    const s = slotsState({ betAmount: 100, spinsPlayed: 5 })
    const next = slotsReducer(s, slotsSpin(reels))
    expect(next.spinsPlayed).toBe(6)
  })

  it('adds betAmount to totalWagered', () => {
    const s = slotsState({ betAmount: 500, totalWagered: 1000 })
    const next = slotsReducer(s, slotsSpin(reels))
    expect(next.totalWagered).toBe(1500)
  })

  it('resets reelStops', () => {
    const s = slotsState({ betAmount: 100 })
    const next = slotsReducer(s, slotsSpin(reels))
    expect(next.reelStops).toEqual([false, false, false])
  })

  it('blocked when not in betting phase', () => {
    const s = spinningState()
    expect(slotsReducer(s, slotsSpin(reels))).toBe(s)
  })

  it('blocked when betAmount exceeds bankroll', () => {
    const s = slotsState({ bankroll: 50, betAmount: 100 })
    expect(slotsReducer(s, slotsSpin(reels))).toBe(s)
  })

  it('blocked when no reels payload', () => {
    const s = slotsState({ betAmount: 100 })
    expect(slotsReducer(s, slotsSpin(null))).toBe(s)
  })

  it('blocked when reels has wrong length', () => {
    const s = slotsState({ betAmount: 100 })
    expect(slotsReducer(s, slotsSpin([CHERRY, LEMON]))).toBe(s)
  })

  it('preserves betAmount', () => {
    const s = slotsState({ betAmount: 500 })
    const next = slotsReducer(s, slotsSpin(reels))
    expect(next.betAmount).toBe(500)
  })

  it('works with $1 bet', () => {
    const s = slotsState({ betAmount: 1 })
    const next = slotsReducer(s, slotsSpin(reels))
    expect(next.bankroll).toBe(9999)
    expect(next.totalWagered).toBe(1)
  })
})

// --- SLOTS_REEL_STOP ---

describe('SLOTS_REEL_STOP', () => {
  it('marks reelStops[index] = true', () => {
    const s = spinningState()
    const next = slotsReducer(s, slotsReelStop(0))
    expect(next.reelStops).toEqual([true, false, false])
  })

  it('marks different indices independently', () => {
    let s = spinningState()
    s = slotsReducer(s, slotsReelStop(2))
    expect(s.reelStops).toEqual([false, false, true])
    s = slotsReducer(s, slotsReelStop(0))
    expect(s.reelStops).toEqual([true, false, true])
  })

  it('blocked when not in spinning phase', () => {
    const s = slotsState()
    expect(slotsReducer(s, slotsReelStop(0))).toBe(s)
  })

  it('blocked for out-of-range index', () => {
    const s = spinningState()
    expect(slotsReducer(s, slotsReelStop(3))).toBe(s)
    expect(slotsReducer(s, slotsReelStop(-1))).toBe(s)
  })

  it('blocked when index already stopped (idempotent)', () => {
    const s = spinningState([CHERRY, CHERRY, CHERRY], 100, {
      reelStops: [true, false, false],
    })
    expect(slotsReducer(s, slotsReelStop(0))).toBe(s)
  })
})

// --- SLOTS_RESOLVE ---

describe('SLOTS_RESOLVE', () => {
  it('transitions phase to result', () => {
    const s = spinningState([CHERRY, CHERRY, CHERRY], 100, {
      reelStops: [true, true, true],
    })
    const next = slotsReducer(s, slotsResolve())
    expect(next.phase).toBe('result')
  })

  it('scores triple correctly (Cherry 3×)', () => {
    const s = spinningState([CHERRY, CHERRY, CHERRY], 100, {
      reelStops: [true, true, true],
    })
    const next = slotsReducer(s, slotsResolve())
    expect(next.multiplier).toBe(3)
    expect(next.matchType).toBe('triple')
    expect(next.payout).toBe(300)
  })

  it('scores pair correctly (Cherry 0.5×)', () => {
    const s = spinningState([CHERRY, CHERRY, ORANGE], 100, {
      reelStops: [true, true, true],
    })
    const next = slotsReducer(s, slotsResolve())
    expect(next.multiplier).toBe(0.5)
    expect(next.matchType).toBe('pair')
    expect(next.payout).toBe(50)
  })

  it('scores no match correctly (0× multiplier, $0 payout)', () => {
    const s = spinningState([CHERRY, LEMON, ORANGE], 100, {
      reelStops: [true, true, true],
    })
    const next = slotsReducer(s, slotsResolve())
    expect(next.multiplier).toBe(0)
    expect(next.matchType).toBe('none')
    expect(next.payout).toBe(0)
  })

  it('credits bankroll with payout (Seven triple 75×)', () => {
    const s = spinningState([SEVEN, SEVEN, SEVEN], 100, {
      reelStops: [true, true, true],
      bankroll: 9900,
    })
    const next = slotsReducer(s, slotsResolve())
    expect(next.payout).toBe(7500)
    expect(next.bankroll).toBe(9900 + 7500)
  })

  it('updates totalWon on a win', () => {
    const s = spinningState([SEVEN, SEVEN, SEVEN], 100, {
      reelStops: [true, true, true],
      totalWon: 500,
    })
    const next = slotsReducer(s, slotsResolve())
    // payout=7500, winAmount = 7500-100 = 7400
    expect(next.totalWon).toBe(500 + 7400)
  })

  it('updates totalLost on a loss (no match)', () => {
    const s = spinningState([CHERRY, LEMON, ORANGE], 100, {
      reelStops: [true, true, true],
      totalLost: 200,
    })
    const next = slotsReducer(s, slotsResolve())
    // payout=0, lossAmount = 100-0 = 100
    expect(next.totalLost).toBe(200 + 100)
  })

  it('updates biggestWin only when new win exceeds previous', () => {
    const s = spinningState([CHERRY, CHERRY, CHERRY], 100, {
      reelStops: [true, true, true],
      biggestWin: 2000,
    })
    const next = slotsReducer(s, slotsResolve())
    // Cherry triple: payout=300, winAmount=200, still less than 2000
    expect(next.biggestWin).toBe(2000)
  })

  it('updates biggestWin when new win is larger', () => {
    const s = spinningState([SEVEN, SEVEN, SEVEN], 100, {
      reelStops: [true, true, true],
      biggestWin: 2000,
    })
    const next = slotsReducer(s, slotsResolve())
    // Seven triple: payout=7500, winAmount=7400 > 2000
    expect(next.biggestWin).toBe(7400)
  })

  it('updates peakBankroll correctly', () => {
    const s = spinningState([SEVEN, SEVEN, SEVEN], 100, {
      reelStops: [true, true, true],
      bankroll: 9900,
      peakBankroll: 10000,
    })
    const next = slotsReducer(s, slotsResolve())
    expect(next.peakBankroll).toBe(9900 + 7500)
  })

  it('updates lowestBankroll correctly', () => {
    const s = spinningState([CHERRY, LEMON, ORANGE], 100, {
      reelStops: [true, true, true],
      bankroll: 500,
      lowestBankroll: 600,
    })
    const next = slotsReducer(s, slotsResolve())
    // payout=0, newBankroll=500
    expect(next.lowestBankroll).toBe(500)
  })

  it('increments tripleCount on triple', () => {
    const s = spinningState([CHERRY, CHERRY, CHERRY], 100, {
      reelStops: [true, true, true],
      tripleCount: 3,
    })
    const next = slotsReducer(s, slotsResolve())
    expect(next.tripleCount).toBe(4)
  })

  it('does not increment tripleCount on pair', () => {
    const s = spinningState([CHERRY, CHERRY, ORANGE], 100, {
      reelStops: [true, true, true],
      tripleCount: 3,
    })
    const next = slotsReducer(s, slotsResolve())
    expect(next.tripleCount).toBe(3)
  })

  it('increments jackpotCount only on Jackpot triple', () => {
    const s = spinningState([JACKPOT, JACKPOT, JACKPOT], 100, {
      reelStops: [true, true, true],
      jackpotCount: 0,
    })
    const next = slotsReducer(s, slotsResolve())
    expect(next.jackpotCount).toBe(1)
  })

  it('does not increment jackpotCount on non-Jackpot triple', () => {
    const s = spinningState([DIAMOND, DIAMOND, DIAMOND], 100, {
      reelStops: [true, true, true],
      jackpotCount: 0,
    })
    const next = slotsReducer(s, slotsResolve())
    expect(next.jackpotCount).toBe(0)
  })

  it('break-even case: Lemon pair (1× multiplier)', () => {
    const s = spinningState([LEMON, LEMON, CHERRY], 100, {
      reelStops: [true, true, true],
      totalWon: 50,
      totalLost: 50,
    })
    const next = slotsReducer(s, slotsResolve())
    expect(next.payout).toBe(100)
    expect(next.totalWon).toBe(50)
    expect(next.totalLost).toBe(50)
  })

  it('blocked when not in spinning phase', () => {
    const s = slotsState()
    expect(slotsReducer(s, slotsResolve())).toBe(s)
  })

  it('blocked when not all reels stopped', () => {
    const s = spinningState([CHERRY, CHERRY, CHERRY], 100, {
      reelStops: [true, true, false],
    })
    expect(slotsReducer(s, slotsResolve())).toBe(s)
  })
})

// --- SLOTS_NEW_ROUND ---

describe('SLOTS_NEW_ROUND', () => {
  it('resets phase to betting', () => {
    const s = resultState()
    const next = slotsReducer(s, { type: SLOTS_NEW_ROUND })
    expect(next.phase).toBe('betting')
  })

  it('clears reels, reelStops, multiplier, matchType, payout', () => {
    const s = resultState({
      reels: [CHERRY, CHERRY, CHERRY],
      reelStops: [true, true, true],
      multiplier: 3,
      matchType: 'triple',
      payout: 300,
    })
    const next = slotsReducer(s, { type: SLOTS_NEW_ROUND })
    expect(next.reels).toEqual([null, null, null])
    expect(next.reelStops).toEqual([false, false, false])
    expect(next.multiplier).toBe(0)
    expect(next.matchType).toBeNull()
    expect(next.payout).toBe(0)
  })

  it('preserves betAmount when bankroll can cover it', () => {
    const s = resultState({ bankroll: 1000, betAmount: 500 })
    const next = slotsReducer(s, { type: SLOTS_NEW_ROUND })
    expect(next.betAmount).toBe(500)
  })

  it('clamps betAmount to bankroll when bankroll is lower', () => {
    const s = resultState({ bankroll: 200, betAmount: 500 })
    const next = slotsReducer(s, { type: SLOTS_NEW_ROUND })
    expect(next.betAmount).toBe(200)
  })

  it('preserves stats', () => {
    const s = resultState({ spinsPlayed: 10, totalWagered: 5000, totalWon: 2000 })
    const next = slotsReducer(s, { type: SLOTS_NEW_ROUND })
    expect(next.spinsPlayed).toBe(10)
    expect(next.totalWagered).toBe(5000)
    expect(next.totalWon).toBe(2000)
  })

  it('blocked when not in result phase', () => {
    const s = slotsState()
    expect(slotsReducer(s, { type: SLOTS_NEW_ROUND })).toBe(s)
  })
})

// --- SLOTS_RESET ---

describe('SLOTS_RESET', () => {
  it('returns initial state', () => {
    const s = resultState({ bankroll: 500, spinsPlayed: 20 })
    const next = slotsReducer(s, slotsReset())
    expect(next.bankroll).toBe(10000)
    expect(next.spinsPlayed).toBe(0)
    expect(next.phase).toBe('betting')
  })

  it('preserves muted flag', () => {
    const s = resultState({ muted: true })
    const next = slotsReducer(s, slotsReset())
    expect(next.muted).toBe(true)
  })

  it('resets betAmount to default', () => {
    const s = resultState({ betAmount: 5000 })
    const next = slotsReducer(s, slotsReset())
    expect(next.betAmount).toBe(100)
  })

  it('resets all stats to 0', () => {
    const s = resultState({
      spinsPlayed: 50, totalWagered: 10000, totalWon: 3000,
      totalLost: 7000, biggestWin: 500, tripleCount: 5, jackpotCount: 1,
    })
    const next = slotsReducer(s, slotsReset())
    expect(next.spinsPlayed).toBe(0)
    expect(next.totalWagered).toBe(0)
    expect(next.totalWon).toBe(0)
    expect(next.totalLost).toBe(0)
    expect(next.biggestWin).toBe(0)
    expect(next.tripleCount).toBe(0)
    expect(next.jackpotCount).toBe(0)
  })

  it('works from any phase', () => {
    const s = spinningState()
    const next = slotsReducer(s, slotsReset())
    expect(next.phase).toBe('betting')
    expect(next.bankroll).toBe(10000)
  })
})

// --- SLOTS_TOGGLE_MUTE ---

describe('SLOTS_TOGGLE_MUTE', () => {
  it('toggles muted from false to true', () => {
    const s = slotsState({ muted: false })
    expect(slotsReducer(s, { type: SLOTS_TOGGLE_MUTE }).muted).toBe(true)
  })

  it('toggles muted from true to false', () => {
    const s = slotsState({ muted: true })
    expect(slotsReducer(s, { type: SLOTS_TOGGLE_MUTE }).muted).toBe(false)
  })
})

// --- Default ---

describe('default', () => {
  it('returns state unchanged for unknown action type', () => {
    const s = slotsState()
    expect(slotsReducer(s, { type: 'UNKNOWN' })).toBe(s)
  })
})
