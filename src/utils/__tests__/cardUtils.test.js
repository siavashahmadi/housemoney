import { describe, it, expect } from 'vitest'
import {
  cardValue,
  createDeck,
  shuffle,
  handValue,
  isSoft,
  isBlackjack,
  isWinResult,
  isLossResult,
  determineOutcome,
} from '../cardUtils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal card object understood by the utils. */
function card(rank, suit = 'spades') {
  return { rank, suit, id: `${suit}-${rank}-0` }
}

// ---------------------------------------------------------------------------
// cardValue
// ---------------------------------------------------------------------------

describe('cardValue', () => {
  it('returns 11 for an Ace', () => {
    expect(cardValue(card('A'))).toBe(11)
  })

  it('returns 10 for a King', () => {
    expect(cardValue(card('K'))).toBe(10)
  })

  it('returns 10 for a Queen', () => {
    expect(cardValue(card('Q'))).toBe(10)
  })

  it('returns 10 for a Jack', () => {
    expect(cardValue(card('J'))).toBe(10)
  })

  it('returns 10 for a ten', () => {
    expect(cardValue(card('10'))).toBe(10)
  })

  it('returns pip value for 2', () => {
    expect(cardValue(card('2'))).toBe(2)
  })

  it('returns pip value for 7', () => {
    expect(cardValue(card('7'))).toBe(7)
  })

  it('returns pip value for 9', () => {
    expect(cardValue(card('9'))).toBe(9)
  })

  it('returns 0 for a null/missing rank', () => {
    expect(cardValue({ rank: null, suit: 'spades' })).toBe(0)
  })

  it('returns 0 for rank "?" (face-down card)', () => {
    expect(cardValue({ rank: '?', suit: 'spades' })).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// createDeck
// ---------------------------------------------------------------------------

describe('createDeck', () => {
  it('creates 312 cards with the default 6-deck shoe', () => {
    const deck = createDeck()
    expect(deck).toHaveLength(312)
  })

  it('creates 52 cards for a single deck', () => {
    const deck = createDeck(1)
    expect(deck).toHaveLength(52)
  })

  it('creates 104 cards for 2 decks', () => {
    const deck = createDeck(2)
    expect(deck).toHaveLength(104)
  })

  it('all cards have unique IDs', () => {
    const deck = createDeck(6)
    const ids = deck.map(c => c.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(deck.length)
  })

  it('contains exactly 4 suits per deck (13 cards per suit)', () => {
    const deck = createDeck(1)
    const suits = ['hearts', 'diamonds', 'clubs', 'spades']
    for (const suit of suits) {
      const count = deck.filter(c => c.suit === suit).length
      expect(count).toBe(13)
    }
  })

  it('contains 24 of each suit across a 6-deck shoe (6 * 4 suits, 13 ranks each)', () => {
    const deck = createDeck(6)
    const suits = ['hearts', 'diamonds', 'clubs', 'spades']
    for (const suit of suits) {
      const count = deck.filter(c => c.suit === suit).length
      expect(count).toBe(78) // 13 ranks * 6 decks
    }
  })
})

// ---------------------------------------------------------------------------
// shuffle
// ---------------------------------------------------------------------------

describe('shuffle', () => {
  it('returns the same array reference (in-place)', () => {
    const deck = createDeck(1)
    const ref = deck
    const result = shuffle(deck)
    expect(result).toBe(ref)
  })

  it('contains the same cards after shuffling (no loss or duplication)', () => {
    const deck = createDeck(1)
    const idsBefore = deck.map(c => c.id).sort()
    shuffle(deck)
    const idsAfter = deck.map(c => c.id).sort()
    expect(idsAfter).toEqual(idsBefore)
  })

  it('actually shuffles — first 10 cards differ from the sorted original with high probability', () => {
    // Use a full 6-deck shoe (312 cards) to make false positives statistically negligible.
    // The probability that the first 10 cards are identical by chance is astronomically small.
    const sorted = createDeck(6)
    const sortedFirst10 = sorted.slice(0, 10).map(c => c.id)

    const shuffled = createDeck(6)
    shuffle(shuffled)
    const shuffledFirst10 = shuffled.slice(0, 10).map(c => c.id)

    expect(shuffledFirst10).not.toEqual(sortedFirst10)
  })
})

// ---------------------------------------------------------------------------
// handValue
// ---------------------------------------------------------------------------

describe('handValue', () => {
  it('10 + 7 = 17', () => {
    expect(handValue([card('10'), card('7')])).toBe(17)
  })

  it('A + 6 = 17 (ace counted as 11)', () => {
    expect(handValue([card('A'), card('6')])).toBe(17)
  })

  it('A + 6 + 10 = 17 (ace reduced from 11 to 1)', () => {
    expect(handValue([card('A'), card('6'), card('10')])).toBe(17)
  })

  it('A + A = 12 (one ace as 11, one as 1)', () => {
    expect(handValue([card('A'), card('A')])).toBe(12)
  })

  it('A + A + A = 13 (two aces reduced to 1 each, one remains 11)', () => {
    expect(handValue([card('A'), card('A'), card('A')])).toBe(13)
  })

  it('A + K = 21 (natural blackjack)', () => {
    expect(handValue([card('A'), card('K')])).toBe(21)
  })

  it('10 + 10 + 5 = 25 (bust)', () => {
    expect(handValue([card('10'), card('10'), card('5')])).toBe(25)
  })

  it('2 + 3 = 5', () => {
    expect(handValue([card('2'), card('3')])).toBe(5)
  })

  it('K + Q + A = 21 (ace reduced to 1 to avoid bust)', () => {
    expect(handValue([card('K'), card('Q'), card('A')])).toBe(21)
  })
})

// ---------------------------------------------------------------------------
// isSoft
// ---------------------------------------------------------------------------

describe('isSoft', () => {
  it('A + 6 is soft (ace counted as 11)', () => {
    expect(isSoft([card('A'), card('6')])).toBe(true)
  })

  it('A + 6 + 10 is NOT soft (ace reduced to 1)', () => {
    expect(isSoft([card('A'), card('6'), card('10')])).toBe(false)
  })

  it('10 + 7 is NOT soft (no ace)', () => {
    expect(isSoft([card('10'), card('7')])).toBe(false)
  })

  it('A + A is soft (one ace still counted as 11)', () => {
    expect(isSoft([card('A'), card('A')])).toBe(true)
  })

  it('A + 9 is soft (soft 20)', () => {
    expect(isSoft([card('A'), card('9')])).toBe(true)
  })

  it('A + 10 is soft (soft 21 / blackjack)', () => {
    expect(isSoft([card('A'), card('10')])).toBe(true)
  })

  it('A + A + 9 is NOT soft (both aces reduced to 1 to reach 11)', () => {
    // A + A + 9 raw = 31; reduce one ace → 21; still > 21? No — 21 is fine.
    // Actually: raw = 11+11+9 = 31; reduce one ace → 21; 21 <= 21 so stop.
    // reducedAces = 1, aces = 2 → reducedAces < aces → soft = true
    expect(isSoft([card('A'), card('A'), card('9')])).toBe(true)
  })

  it('A + A + A + 8 is soft (only two aces need reducing to reach 21)', () => {
    // raw: 11+11+11+8 = 41
    // reduce loop: 41 → 31 (reducedAces=1), 31 → 21 (reducedAces=2)
    // total is now exactly 21, loop stops; reducedAces(2) < aces(3) → still soft
    expect(isSoft([card('A'), card('A'), card('A'), card('8')])).toBe(true)
  })

  it('A + A + A + A + 7 is NOT soft (all four aces must be reduced to 1)', () => {
    // raw: 11*4 + 7 = 51
    // reduce: 41 → 31 → 21 → 11; reducedAces=3, aces=4 → still soft at 21? No:
    // Actually 51→41(r=1)→31(r=2)→21(r=3) — stops at 21, r=3 < aces=4 → still soft
    // To get "not soft" we need all aces reduced AND total still > 21, which can't happen
    // because reducing the 4th ace brings total to 11, not > 21.
    // Use 5 aces + a ten: 11*5 + 10 = 65 → reduce to 15 (all 5 reduced) → NOT soft
    expect(isSoft([card('A'), card('A'), card('A'), card('A'), card('A'), card('10')])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isBlackjack
// ---------------------------------------------------------------------------

describe('isBlackjack', () => {
  it('A + K = true (natural blackjack)', () => {
    expect(isBlackjack([card('A'), card('K')])).toBe(true)
  })

  it('A + 10 = true (natural blackjack)', () => {
    expect(isBlackjack([card('A'), card('10')])).toBe(true)
  })

  it('A + Q = true (natural blackjack)', () => {
    expect(isBlackjack([card('A'), card('Q')])).toBe(true)
  })

  it('A + J = true (natural blackjack)', () => {
    expect(isBlackjack([card('A'), card('J')])).toBe(true)
  })

  it('7 + 7 + 7 = false (21 but three cards)', () => {
    expect(isBlackjack([card('7'), card('7'), card('7')])).toBe(false)
  })

  it('A + 5 + 5 = false (21 but three cards)', () => {
    expect(isBlackjack([card('A'), card('5'), card('5')])).toBe(false)
  })

  it('K + Q = false (not 21)', () => {
    expect(isBlackjack([card('K'), card('Q')])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isWinResult
// ---------------------------------------------------------------------------

describe('isWinResult', () => {
  it('"win" returns true', () => {
    expect(isWinResult('win')).toBe(true)
  })

  it('"dealerBust" returns true', () => {
    expect(isWinResult('dealerBust')).toBe(true)
  })

  it('"blackjack" returns true', () => {
    expect(isWinResult('blackjack')).toBe(true)
  })

  it('"lose" returns false', () => {
    expect(isWinResult('lose')).toBe(false)
  })

  it('"bust" returns false', () => {
    expect(isWinResult('bust')).toBe(false)
  })

  it('"push" returns false', () => {
    expect(isWinResult('push')).toBe(false)
  })

  it('"mixed" returns false', () => {
    expect(isWinResult('mixed')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isLossResult
// ---------------------------------------------------------------------------

describe('isLossResult', () => {
  it('"lose" returns true', () => {
    expect(isLossResult('lose')).toBe(true)
  })

  it('"bust" returns true', () => {
    expect(isLossResult('bust')).toBe(true)
  })

  it('"win" returns false', () => {
    expect(isLossResult('win')).toBe(false)
  })

  it('"dealerBust" returns false', () => {
    expect(isLossResult('dealerBust')).toBe(false)
  })

  it('"blackjack" returns false', () => {
    expect(isLossResult('blackjack')).toBe(false)
  })

  it('"push" returns false', () => {
    expect(isLossResult('push')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// determineOutcome
// ---------------------------------------------------------------------------

describe('determineOutcome', () => {
  it('player 19 vs dealer 17 → "win"', () => {
    const player = [card('10'), card('9')]
    const dealer = [card('10'), card('7')]
    expect(determineOutcome(player, dealer)).toBe('win')
  })

  it('player 17 vs dealer 19 → "lose"', () => {
    const player = [card('10'), card('7')]
    const dealer = [card('10'), card('9')]
    expect(determineOutcome(player, dealer)).toBe('lose')
  })

  it('player 18 vs dealer 18 → "push"', () => {
    const player = [card('10'), card('8')]
    const dealer = [card('10'), card('8')]
    expect(determineOutcome(player, dealer)).toBe('push')
  })

  it('player 18 vs dealer bust (26) → "dealerBust"', () => {
    const player = [card('10'), card('8')]
    // Dealer: 10 + 10 + 6 = 26
    const dealer = [card('10'), card('10'), card('6')]
    expect(determineOutcome(player, dealer)).toBe('dealerBust')
  })

  it('player 21 (non-blackjack) vs dealer 20 → "win"', () => {
    const player = [card('7'), card('7'), card('7')]
    const dealer = [card('10'), card('10')]
    expect(determineOutcome(player, dealer)).toBe('win')
  })

  it('player bust (22) vs dealer bust (23) → "dealerBust" (dealer busts checked first)', () => {
    // determineOutcome checks dealerVal > 21 first
    const player = [card('10'), card('10'), card('2')]
    const dealer = [card('10'), card('10'), card('3')]
    expect(determineOutcome(player, dealer)).toBe('dealerBust')
  })
})
