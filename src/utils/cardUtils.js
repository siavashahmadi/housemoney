import { SUITS, RANKS } from '../constants/cards'
import { DECK_COUNT } from '../constants/gameConfig'
import { RESULTS } from '../constants/results'

/**
 * Returns the numeric value of a single card.
 * Face cards = 10, Ace = 11 (ace adjustment happens in handValue).
 */
export function cardValue(card) {
  if (!card.rank || card.rank === '?') return 0
  if (card.rank === 'A') return 11
  if (['K', 'Q', 'J'].includes(card.rank)) return 10
  return parseInt(card.rank, 10)
}

/**
 * Creates a multi-deck shoe.
 * Each card: { rank, suit, id }
 */
export function createDeck(deckCount = DECK_COUNT) {
  const deck = []
  for (let d = 0; d < deckCount; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ rank, suit, id: `${suit}-${rank}-${d}` })
      }
    }
  }
  return deck
}

/**
 * Fisher-Yates in-place shuffle. Returns the array.
 */
export function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

/**
 * Calculates the best hand value.
 * Aces count as 11 unless that would bust, then they count as 1.
 */
export function handValue(hand) {
  let total = 0
  let aces = 0

  for (const card of hand) {
    const val = cardValue(card)
    total += val
    if (card.rank === 'A') aces++
  }

  while (total > 21 && aces > 0) {
    total -= 10
    aces--
  }

  return total
}

/**
 * Returns true if the hand is "soft" — contains an ace currently counted as 11.
 * A hand is soft if reducing one ace from 11 to 1 (subtracting 10) would still leave
 * the total >= the number of remaining cards that could be aces.
 */
export function isSoft(hand) {
  let total = 0
  let aces = 0

  for (const card of hand) {
    total += cardValue(card)
    if (card.rank === 'A') aces++
  }

  // Reduce aces until we're at or below 21
  let reducedAces = 0
  while (total > 21 && reducedAces < aces) {
    total -= 10
    reducedAces++
  }

  // Hand is soft if at least one ace is still counted as 11
  return reducedAces < aces
}

/**
 * Returns true if the hand is a natural blackjack (exactly 2 cards totaling 21).
 */
export function isBlackjack(hand) {
  return hand.length === 2 && handValue(hand) === 21
}

/**
 * Returns true if the result represents a player win.
 */
export function isWinResult(result) {
  return result === RESULTS.WIN || result === RESULTS.DEALER_BUST || result === RESULTS.BLACKJACK
}

/**
 * Returns true if the result represents a player loss.
 */
export function isLossResult(result) {
  return result === RESULTS.LOSE || result === RESULTS.BUST
}

/**
 * Determines the outcome of a player hand vs dealer hand.
 */
export function determineOutcome(playerCards, dealerHand) {
  const playerVal = handValue(playerCards)
  const dealerVal = handValue(dealerHand)
  if (dealerVal > 21) return RESULTS.DEALER_BUST
  if (dealerVal > playerVal) return RESULTS.LOSE
  if (playerVal > dealerVal) return RESULTS.WIN
  return RESULTS.PUSH
}
