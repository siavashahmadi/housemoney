export const SLOT_SYMBOLS = [
  { index: 0, emoji: '🍒', name: 'Cherry', value: 5, weight: 30 },
  { index: 1, emoji: '🍋', name: 'Lemon', value: 10, weight: 25 },
  { index: 2, emoji: '🍊', name: 'Orange', value: 15, weight: 20 },
  { index: 3, emoji: '🔔', name: 'Bell', value: 25, weight: 12 },
  { index: 4, emoji: '💎', name: 'Diamond', value: 50, weight: 7 },
  { index: 5, emoji: '7️⃣', name: 'Seven', value: 100, weight: 4 },
  { index: 6, emoji: '💰', name: 'Jackpot', value: 250, weight: 2 },
]

export const TOTAL_WEIGHT = 100

export const HOUSE_EDGE = 0.08

// Payout multipliers: payout = floor(bet × multiplier)
// Triple = always a big win, Pair = small-to-medium win, No match = lose bet
// Expected return ~88% (11.6% house edge)
export const TRIPLE_MULTIPLIERS = {
  Cherry: 3, Lemon: 5, Orange: 8, Bell: 15,
  Diamond: 30, Seven: 75, Jackpot: 250,
}
export const PAIR_MULTIPLIERS = {
  Cherry: 0.5, Lemon: 1, Orange: 1.5, Bell: 2.5,
  Diamond: 5, Seven: 10, Jackpot: 25,
}

export const ROUND_OPTIONS = [5, 10, 15]

export const SLOTS_STARTING_BANKROLL = 10000
