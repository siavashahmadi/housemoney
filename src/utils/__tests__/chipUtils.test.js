import { describe, it, expect } from 'vitest'
import { sumChipStack, decomposeIntoChips } from '../chipUtils'

// ---------------------------------------------------------------------------
// sumChipStack
// ---------------------------------------------------------------------------

describe('sumChipStack', () => {
  it('empty array returns 0', () => {
    expect(sumChipStack([])).toBe(0)
  })

  it('single chip [100] returns 100', () => {
    expect(sumChipStack([100])).toBe(100)
  })

  it('[100, 100, 500] returns 700', () => {
    expect(sumChipStack([100, 100, 500])).toBe(700)
  })

  it('[25] returns 25 (minimum chip)', () => {
    expect(sumChipStack([25])).toBe(25)
  })

  it('[10000000] returns 10000000 (maximum chip)', () => {
    expect(sumChipStack([10000000])).toBe(10000000)
  })

  it('large mixed stack sums correctly', () => {
    expect(sumChipStack([25, 100, 500, 1000, 5000])).toBe(6625)
  })
})

// ---------------------------------------------------------------------------
// decomposeIntoChips
// ---------------------------------------------------------------------------

// Valid chip denominations from chips.js (ascending order)
const VALID_CHIP_VALUES = new Set([25, 100, 500, 1000, 5000, 25000, 100000, 500000, 1000000, 10000000])

describe('decomposeIntoChips', () => {
  it('$0 returns an empty array', () => {
    expect(decomposeIntoChips(0)).toEqual([])
  })

  it('$25 returns [25]', () => {
    expect(decomposeIntoChips(25)).toEqual([25])
  })

  it('$100 returns [100]', () => {
    expect(decomposeIntoChips(100)).toEqual([100])
  })

  it('$125 returns [100, 25]', () => {
    expect(decomposeIntoChips(125)).toEqual([100, 25])
  })

  it('$700 returns [500, 100, 100]', () => {
    expect(decomposeIntoChips(700)).toEqual([500, 100, 100])
  })

  it('$10000 uses largest chips possible (greedy decomposition)', () => {
    // 10000 = 5000 + 5000
    expect(decomposeIntoChips(10000)).toEqual([5000, 5000])
  })

  it('$10000000 returns [10000000] (single max chip)', () => {
    expect(decomposeIntoChips(10000000)).toEqual([10000000])
  })

  it('output sums to input — $1250', () => {
    const chips = decomposeIntoChips(1250)
    expect(chips.reduce((s, v) => s + v, 0)).toBe(1250)
  })

  it('output sums to input — $6625', () => {
    const chips = decomposeIntoChips(6625)
    expect(chips.reduce((s, v) => s + v, 0)).toBe(6625)
  })

  it('output sums to input — $99925', () => {
    const chips = decomposeIntoChips(99925)
    expect(chips.reduce((s, v) => s + v, 0)).toBe(99925)
  })

  it('output sums to input — $1500000', () => {
    const chips = decomposeIntoChips(1500000)
    expect(chips.reduce((s, v) => s + v, 0)).toBe(1500000)
  })

  it('all chips in result are valid denominations', () => {
    const amounts = [25, 100, 700, 10000, 99925, 1500000]
    for (const amount of amounts) {
      const chips = decomposeIntoChips(amount)
      for (const chip of chips) {
        expect(VALID_CHIP_VALUES.has(chip)).toBe(true)
      }
    }
  })

  it('chips are in descending order (greedy largest-first)', () => {
    const testAmounts = [125, 700, 10000, 99925, 1500000]
    for (const amount of testAmounts) {
      const chips = decomposeIntoChips(amount)
      for (let i = 1; i < chips.length; i++) {
        expect(chips[i]).toBeLessThanOrEqual(chips[i - 1])
      }
    }
  })

  it('$500 returns [500] (exact chip match)', () => {
    expect(decomposeIntoChips(500)).toEqual([500])
  })

  it('$1000 returns [1000] (exact chip match)', () => {
    expect(decomposeIntoChips(1000)).toEqual([1000])
  })

  it('$525 returns [500, 25]', () => {
    expect(decomposeIntoChips(525)).toEqual([500, 25])
  })

  it('$50 returns [25, 25]', () => {
    expect(decomposeIntoChips(50)).toEqual([25, 25])
  })
})
