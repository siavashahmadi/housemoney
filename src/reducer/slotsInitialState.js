import { SLOTS_STARTING_BANKROLL } from '../constants/slotSymbols'

export function createSlotsInitialState() {
  return {
    phase: 'betting',
    bankroll: SLOTS_STARTING_BANKROLL,
    betAmount: 100,
    reels: [null, null, null],
    reelStops: [false, false, false],
    multiplier: 0,
    matchType: null,
    payout: 0,
    spinsPlayed: 0,
    totalWagered: 0,
    totalWon: 0,
    totalLost: 0,
    biggestWin: 0,
    peakBankroll: SLOTS_STARTING_BANKROLL,
    lowestBankroll: SLOTS_STARTING_BANKROLL,
    tripleCount: 0,
    jackpotCount: 0,
    muted: false,
  }
}
