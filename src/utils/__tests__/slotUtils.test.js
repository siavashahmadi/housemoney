import { describe, it, expect } from 'vitest'
import { pickSymbol, scoreReels, generateSpin, calculatePayout } from '../slotUtils'
import { SLOT_SYMBOLS } from '../../constants/slotSymbols'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHERRY = SLOT_SYMBOLS[0]
const LEMON = SLOT_SYMBOLS[1]
const ORANGE = SLOT_SYMBOLS[2]
const BELL = SLOT_SYMBOLS[3]
const DIAMOND = SLOT_SYMBOLS[4]
const SEVEN = SLOT_SYMBOLS[5]
const JACKPOT = SLOT_SYMBOLS[6]

// ---------------------------------------------------------------------------
// pickSymbol
// ---------------------------------------------------------------------------

describe('pickSymbol', () => {
  // Cumulative boundaries: Cherry 0-30, Lemon 30-55, Orange 55-75,
  // Bell 75-87, Diamond 87-94, Seven 94-98, Jackpot 98-100

  it('returns Cherry for randomFloat 0.0', () => {
    expect(pickSymbol(0.0)).toBe(CHERRY)
  })

  it('returns Cherry just under the boundary (0.29)', () => {
    expect(pickSymbol(0.29)).toBe(CHERRY)
  })

  it('returns Lemon at exact boundary (0.30)', () => {
    expect(pickSymbol(0.30)).toBe(LEMON)
  })

  it('returns Lemon just under its upper boundary (0.549)', () => {
    expect(pickSymbol(0.549)).toBe(LEMON)
  })

  it('returns Orange at Lemon upper boundary (0.55)', () => {
    expect(pickSymbol(0.55)).toBe(ORANGE)
  })

  it('returns Bell at 0.75', () => {
    expect(pickSymbol(0.75)).toBe(BELL)
  })

  it('returns Diamond at 0.87', () => {
    expect(pickSymbol(0.87)).toBe(DIAMOND)
  })

  it('returns Seven at 0.94', () => {
    expect(pickSymbol(0.94)).toBe(SEVEN)
  })

  it('returns Jackpot at 0.98', () => {
    expect(pickSymbol(0.98)).toBe(JACKPOT)
  })

  it('returns Jackpot at high end (0.99)', () => {
    expect(pickSymbol(0.99)).toBe(JACKPOT)
  })

  it('returns last symbol as fallback for 1.0', () => {
    expect(pickSymbol(1.0)).toBe(JACKPOT)
  })
})

// ---------------------------------------------------------------------------
// scoreReels
// ---------------------------------------------------------------------------

describe('scoreReels', () => {
  describe('triple', () => {
    it('scores Cherry triple with 3× multiplier', () => {
      const result = scoreReels([CHERRY, CHERRY, CHERRY])
      expect(result).toEqual({ multiplier: 3, matchType: 'triple', matchedSymbol: CHERRY })
    })

    it('scores Jackpot triple with 250× multiplier', () => {
      const result = scoreReels([JACKPOT, JACKPOT, JACKPOT])
      expect(result).toEqual({ multiplier: 250, matchType: 'triple', matchedSymbol: JACKPOT })
    })

    it('scores Seven triple with 75× multiplier', () => {
      const result = scoreReels([SEVEN, SEVEN, SEVEN])
      expect(result).toEqual({ multiplier: 75, matchType: 'triple', matchedSymbol: SEVEN })
    })

    it('scores Bell triple with 15× multiplier', () => {
      const result = scoreReels([BELL, BELL, BELL])
      expect(result).toEqual({ multiplier: 15, matchType: 'triple', matchedSymbol: BELL })
    })

    it('scores Diamond triple with 30× multiplier', () => {
      const result = scoreReels([DIAMOND, DIAMOND, DIAMOND])
      expect(result).toEqual({ multiplier: 30, matchType: 'triple', matchedSymbol: DIAMOND })
    })
  })

  describe('pair', () => {
    it('detects pair at positions [0,1]', () => {
      const result = scoreReels([BELL, BELL, CHERRY])
      expect(result).toEqual({ multiplier: 2.5, matchType: 'pair', matchedSymbol: BELL })
    })

    it('detects pair at positions [1,2]', () => {
      const result = scoreReels([CHERRY, BELL, BELL])
      expect(result).toEqual({ multiplier: 2.5, matchType: 'pair', matchedSymbol: BELL })
    })

    it('detects pair at positions [0,2]', () => {
      const result = scoreReels([BELL, CHERRY, BELL])
      expect(result).toEqual({ multiplier: 2.5, matchType: 'pair', matchedSymbol: BELL })
    })

    it('uses multiplier of matched symbol', () => {
      const result = scoreReels([DIAMOND, DIAMOND, CHERRY])
      expect(result).toEqual({ multiplier: 5, matchType: 'pair', matchedSymbol: DIAMOND })
    })

    it('Cherry pair returns 0.5× multiplier', () => {
      const result = scoreReels([CHERRY, CHERRY, ORANGE])
      expect(result).toEqual({ multiplier: 0.5, matchType: 'pair', matchedSymbol: CHERRY })
    })

    it('Lemon pair returns 1× multiplier (break even)', () => {
      const result = scoreReels([LEMON, LEMON, CHERRY])
      expect(result).toEqual({ multiplier: 1, matchType: 'pair', matchedSymbol: LEMON })
    })
  })

  describe('no match', () => {
    it('returns 0 multiplier when no symbols match', () => {
      const result = scoreReels([CHERRY, ORANGE, BELL])
      expect(result).toEqual({ multiplier: 0, matchType: 'none', matchedSymbol: null })
    })

    it('returns 0 multiplier for high-value non-matching symbols', () => {
      const result = scoreReels([DIAMOND, SEVEN, JACKPOT])
      expect(result).toEqual({ multiplier: 0, matchType: 'none', matchedSymbol: null })
    })
  })
})

// ---------------------------------------------------------------------------
// generateSpin
// ---------------------------------------------------------------------------

describe('generateSpin', () => {
  it('returns array of 3 symbols', () => {
    const result = generateSpin(0.0, 0.0, 0.0)
    expect(result).toHaveLength(3)
  })

  it('returns all Cherries for three 0.0 values', () => {
    const result = generateSpin(0.0, 0.0, 0.0)
    expect(result).toEqual([CHERRY, CHERRY, CHERRY])
  })

  it('returns correct symbols for varied floats', () => {
    const result = generateSpin(0.0, 0.55, 0.99)
    expect(result).toEqual([CHERRY, ORANGE, JACKPOT])
  })
})

// ---------------------------------------------------------------------------
// calculatePayout
// ---------------------------------------------------------------------------

describe('calculatePayout', () => {
  it('returns bet amount for 1× multiplier (break even)', () => {
    expect(calculatePayout(1, 100)).toBe(100)
  })

  it('returns half bet for 0.5× multiplier (Cherry pair)', () => {
    expect(calculatePayout(0.5, 100)).toBe(50)
  })

  it('returns 5× bet for Diamond pair', () => {
    expect(calculatePayout(5, 100)).toBe(500)
  })

  it('floors fractional payouts', () => {
    expect(calculatePayout(2.5, 25)).toBe(62) // floor(2.5 * 25) = floor(62.5)
  })

  it('returns 0 for 0× multiplier (no match)', () => {
    expect(calculatePayout(0, 100)).toBe(0)
  })

  it('handles large triple jackpot payout', () => {
    expect(calculatePayout(250, 25)).toBe(6250) // 250 × $25
  })

  it('handles 75× Seven triple', () => {
    expect(calculatePayout(75, 100)).toBe(7500)
  })
})
