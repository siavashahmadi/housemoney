import { SLOT_SYMBOLS, TOTAL_WEIGHT, TRIPLE_MULTIPLIERS, PAIR_MULTIPLIERS } from '../constants/slotSymbols'

/**
 * Picks a symbol by walking cumulative weights.
 * @param {number} randomFloat - A value in [0, 1) (e.g., from Math.random()).
 * @returns {object} The selected symbol object from SLOT_SYMBOLS.
 */
export function pickSymbol(randomFloat) {
  const target = randomFloat * TOTAL_WEIGHT
  let cumulative = 0
  for (const symbol of SLOT_SYMBOLS) {
    cumulative += symbol.weight
    if (target < cumulative) {
      return symbol
    }
  }
  return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1]
}

/**
 * Scores a set of 3 reel symbols. Returns a payout multiplier.
 * Triple (all 3 match): big multiplier (3×–250× bet).
 * Pair (any 2 match): small multiplier (0.5×–25× bet).
 * No match: 0 (lose the bet).
 * @param {object[]} symbols - Array of exactly 3 symbol objects.
 * @returns {{ multiplier: number, matchType: string, matchedSymbol: object|null }}
 */
export function scoreReels(symbols) {
  const [a, b, c] = symbols

  // Triple
  if (a.index === b.index && b.index === c.index) {
    return { multiplier: TRIPLE_MULTIPLIERS[a.name], matchType: 'triple', matchedSymbol: a }
  }

  // Pair — check in specified order
  if (a.index === b.index) {
    return { multiplier: PAIR_MULTIPLIERS[a.name], matchType: 'pair', matchedSymbol: a }
  }
  if (b.index === c.index) {
    return { multiplier: PAIR_MULTIPLIERS[b.name], matchType: 'pair', matchedSymbol: b }
  }
  if (a.index === c.index) {
    return { multiplier: PAIR_MULTIPLIERS[a.name], matchType: 'pair', matchedSymbol: a }
  }

  // No match — lose the bet
  return { multiplier: 0, matchType: 'none', matchedSymbol: null }
}

/**
 * Generates a spin result from 3 pre-generated random floats.
 * @param {number} r1 - Random float [0, 1) for reel 1.
 * @param {number} r2 - Random float [0, 1) for reel 2.
 * @param {number} r3 - Random float [0, 1) for reel 3.
 * @returns {object[]} Array of 3 symbol objects.
 */
export function generateSpin(r1, r2, r3) {
  return [pickSymbol(r1), pickSymbol(r2), pickSymbol(r3)]
}

/**
 * Calculates the payout for a given multiplier and bet amount.
 * @param {number} multiplier - The multiplier from scoreReels().
 * @param {number} bet - The bet amount in credits.
 * @returns {number} The payout amount (floored to integer).
 */
export function calculatePayout(multiplier, bet) {
  return Math.floor(multiplier * bet)
}
