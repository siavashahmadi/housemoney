import { handValue } from '../utils/cardUtils'
import { SUIT_COLORS } from './cards'

export const SIDE_BET_TYPES = {
  PERFECT_PAIR: 'perfectPair',
  COLOR_MATCH: 'colorMatch',
  DEALER_BUST: 'dealerBust',
  LUCKY_LUCKY: 'luckyLucky',
  JINX_BET: 'jinxBet',
}

export const SIDE_BET_DEFINITIONS = [
  { type: 'perfectPair', name: 'Perfect Pair', description: 'First two cards: same rank and suit', payout: 25, resolveAt: 'deal' },
  { type: 'colorMatch', name: 'Color Match', description: 'First two cards: same color', payout: 1, resolveAt: 'deal' },
  { type: 'dealerBust', name: 'Dealer Bust', description: 'The dealer busts this hand', payout: 2, resolveAt: 'resolve' },
  { type: 'luckyLucky', name: 'Lucky Lucky', description: 'Your 2 cards + dealer up card = 19, 20, or 21', payoutTable: { 19: 2, 20: 3, 21: 10 }, resolveAt: 'deal' },
  { type: 'jinxBet', name: 'Jinx Bet', description: 'Bet against yourself. You win when you lose.', payout: 1, resolveAt: 'resolve' },
]

export const SIDE_BET_MAP = Object.fromEntries(SIDE_BET_DEFINITIONS.map(d => [d.type, d]))

// Pure resolution functions
export function resolvePerfectPair(playerCards) {
  if (playerCards.length < 2) return false
  return playerCards[0].rank === playerCards[1].rank && playerCards[0].suit === playerCards[1].suit
}

export function resolveColorMatch(playerCards) {
  if (playerCards.length < 2) return false
  return SUIT_COLORS[playerCards[0].suit] === SUIT_COLORS[playerCards[1].suit]
}

export function resolveLuckyLucky(playerCards, dealerUpCard) {
  if (playerCards.length < 2) return 0
  const total = handValue([playerCards[0], playerCards[1], dealerUpCard])
  const def = SIDE_BET_MAP['luckyLucky']
  return def.payoutTable[total] || 0
}
