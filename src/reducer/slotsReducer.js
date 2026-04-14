import {
  SLOTS_SET_BET,
  SLOTS_SPIN,
  SLOTS_REEL_STOP,
  SLOTS_RESOLVE,
  SLOTS_NEW_ROUND,
  SLOTS_RESET,
  SLOTS_TOGGLE_MUTE,
} from './slotsActions'
import { createSlotsInitialState } from './slotsInitialState'
import { scoreReels, calculatePayout } from '../utils/slotUtils'

export function slotsReducer(state, action) {
  switch (action.type) {
    case SLOTS_SET_BET: {
      if (state.phase !== 'betting') return state
      const amount = Math.max(1, Math.min(Math.floor(action.amount), state.bankroll))
      if (amount === state.betAmount) return state
      return { ...state, betAmount: amount }
    }

    case SLOTS_SPIN: {
      if (state.phase !== 'betting') return state
      if (!action.reels || action.reels.length !== 3) return state
      const bet = state.betAmount
      if (bet <= 0 || bet > state.bankroll) return state
      return {
        ...state,
        phase: 'spinning',
        reels: action.reels,
        reelStops: [false, false, false],
        bankroll: state.bankroll - bet,
        spinsPlayed: state.spinsPlayed + 1,
        totalWagered: state.totalWagered + bet,
        multiplier: 0,
        matchType: null,
        payout: 0,
      }
    }

    case SLOTS_REEL_STOP: {
      if (state.phase !== 'spinning') return state
      if (action.index < 0 || action.index > 2) return state
      if (state.reelStops[action.index]) return state
      const newStops = [...state.reelStops]
      newStops[action.index] = true
      return { ...state, reelStops: newStops }
    }

    case SLOTS_RESOLVE: {
      if (state.phase !== 'spinning') return state
      if (!state.reelStops.every(Boolean)) return state

      const bet = state.betAmount
      const { multiplier, matchType, matchedSymbol } = scoreReels(state.reels)
      const payout = calculatePayout(multiplier, bet)
      const newBankroll = state.bankroll + payout

      const winAmount = payout > bet ? payout - bet : 0
      const lossAmount = payout < bet ? bet - payout : 0

      return {
        ...state,
        phase: 'result',
        multiplier,
        matchType,
        payout,
        bankroll: newBankroll,
        totalWon: state.totalWon + winAmount,
        totalLost: state.totalLost + lossAmount,
        biggestWin: Math.max(state.biggestWin, winAmount),
        peakBankroll: Math.max(state.peakBankroll, newBankroll),
        lowestBankroll: Math.min(state.lowestBankroll, newBankroll),
        tripleCount: matchType === 'triple' ? state.tripleCount + 1 : state.tripleCount,
        jackpotCount: matchType === 'triple' && matchedSymbol && matchedSymbol.name === 'Jackpot'
          ? state.jackpotCount + 1
          : state.jackpotCount,
      }
    }

    case SLOTS_NEW_ROUND: {
      if (state.phase !== 'result') return state
      return {
        ...state,
        phase: 'betting',
        reels: [null, null, null],
        reelStops: [false, false, false],
        multiplier: 0,
        matchType: null,
        payout: 0,
        betAmount: Math.min(state.betAmount, state.bankroll),
      }
    }

    case SLOTS_RESET: {
      return { ...createSlotsInitialState(), muted: state.muted }
    }

    case SLOTS_TOGGLE_MUTE: {
      return { ...state, muted: !state.muted }
    }

    default:
      return state
  }
}
