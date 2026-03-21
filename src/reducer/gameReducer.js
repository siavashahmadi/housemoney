import {
  ADD_CHIP, UNDO_CHIP, CLEAR_CHIPS, SELECT_CHIP, ALL_IN,
  DEAL, BET_ASSET, HIT, STAND, DOUBLE_DOWN, DEALER_DRAW,
  RESOLVE_HAND, NEW_ROUND, RESET_GAME,
  TOGGLE_ASSET_MENU, TOGGLE_ACHIEVEMENTS,
  DISMISS_ACHIEVEMENT, DISMISS_LOAN_SHARK, UNLOCK_ACHIEVEMENT,
  TOGGLE_MUTE,
} from './actions'
import { createInitialState } from './initialState'
import { CHIPS } from '../constants/chips'
import { MIN_BET, BLACKJACK_PAYOUT, RESHUFFLE_THRESHOLD } from '../constants/gameConfig'
import { handValue, isBlackjack, createDeck, shuffle } from '../utils/cardUtils'

// Chip values sorted descending for greedy decomposition
const CHIP_VALUES_DESC = [...CHIPS].map(c => c.value).sort((a, b) => b - a)

function sumChipStack(chipStack) {
  return chipStack.reduce((sum, v) => sum + v, 0)
}

function decomposeIntoChips(amount) {
  const chips = []
  let remaining = amount
  for (const value of CHIP_VALUES_DESC) {
    while (remaining >= value) {
      chips.push(value)
      remaining -= value
    }
  }
  return chips
}

export function gameReducer(state, action) {
  switch (action.type) {
    case ADD_CHIP: {
      if (state.phase !== 'betting') return state
      return { ...state, chipStack: [...state.chipStack, action.value] }
    }

    case UNDO_CHIP: {
      if (state.phase !== 'betting' || state.chipStack.length === 0) return state
      return { ...state, chipStack: state.chipStack.slice(0, -1) }
    }

    case CLEAR_CHIPS: {
      if (state.phase !== 'betting') return state
      return { ...state, chipStack: [] }
    }

    case SELECT_CHIP: {
      return { ...state, selectedChipValue: action.value }
    }

    case ALL_IN: {
      if (state.phase !== 'betting') return state
      const chipStack = state.bankroll <= 0
        ? [MIN_BET]
        : decomposeIntoChips(state.bankroll)
      return { ...state, chipStack, isAllIn: true }
    }

    case DEAL: {
      if (state.phase !== 'betting') return state
      if (sumChipStack(state.chipStack) < MIN_BET) return state
      if (!action.cards || action.cards.length !== 4) return state

      const currentBet = sumChipStack(state.chipStack)
      const playerHand = [action.cards[0], action.cards[2]]
      const dealerHand = [action.cards[1], action.cards[3]]
      const deck = state.deck.slice(4)

      const playerBJ = isBlackjack(playerHand)
      const dealerBJ = isBlackjack(dealerHand)

      let phase = 'playing'
      let result = null

      if (playerBJ && dealerBJ) {
        phase = 'result'
        result = 'push'
      } else if (playerBJ) {
        phase = 'result'
        result = 'blackjack'
      } else if (dealerBJ) {
        phase = 'result'
        result = 'lose'
      }

      return {
        ...state,
        deck,
        playerHand,
        dealerHand,
        currentBet,
        phase,
        result,
        isDoubledDown: false,
      }
    }

    case BET_ASSET: {
      if (state.phase !== 'betting' && state.phase !== 'playing') return state
      if (!state.ownedAssets[action.asset.id]) return state
      if (state.bettedAssets.some(a => a.id === action.asset.id)) return state

      return {
        ...state,
        bettedAssets: [...state.bettedAssets, action.asset],
        ownedAssets: { ...state.ownedAssets, [action.asset.id]: false },
      }
    }

    case HIT: {
      if (state.phase !== 'playing' || state.isDoubledDown) return state

      const playerHand = [...state.playerHand, action.card]
      const deck = state.deck.slice(1)
      const value = handValue(playerHand)

      return {
        ...state,
        playerHand,
        deck,
        phase: value > 21 ? 'result' : 'playing',
        result: value > 21 ? 'bust' : null,
      }
    }

    case STAND: {
      if (state.phase !== 'playing') return state
      return { ...state, phase: 'dealerTurn' }
    }

    case DOUBLE_DOWN: {
      if (state.phase !== 'playing') return state
      if (state.playerHand.length !== 2) return state

      const playerHand = [...state.playerHand, action.card]
      const deck = state.deck.slice(1)
      const currentBet = state.currentBet * 2
      const value = handValue(playerHand)

      return {
        ...state,
        playerHand,
        deck,
        currentBet,
        isDoubledDown: true,
        phase: value > 21 ? 'result' : 'dealerTurn',
        result: value > 21 ? 'bust' : null,
      }
    }

    case DEALER_DRAW: {
      if (state.phase !== 'dealerTurn') return state
      return {
        ...state,
        dealerHand: [...state.dealerHand, action.card],
        deck: state.deck.slice(1),
      }
    }

    case RESOLVE_HAND: {
      // Guard against double-dispatch
      if (state.phase === 'result' && state.chipStack.length === 0) return state

      const { outcome } = action
      const assetValue = state.bettedAssets.reduce((sum, a) => sum + a.value, 0)
      const totalBet = state.currentBet + assetValue

      // Calculate payout delta
      let delta = 0
      switch (outcome) {
        case 'blackjack':
          delta = Math.floor(BLACKJACK_PAYOUT * totalBet)
          break
        case 'win':
        case 'dealerBust':
          delta = totalBet
          break
        case 'push':
          delta = 0
          break
        case 'lose':
        case 'bust':
          delta = -state.currentBet
          break
      }

      const newBankroll = state.bankroll + delta

      // Handle assets: return on win/push, lose on loss/bust
      const isWinOutcome = outcome === 'win' || outcome === 'dealerBust' || outcome === 'blackjack' || outcome === 'push'
      const newOwnedAssets = { ...state.ownedAssets }
      if (isWinOutcome) {
        for (const asset of state.bettedAssets) {
          newOwnedAssets[asset.id] = true
        }
      }

      // Update stats
      const isWin = outcome === 'win' || outcome === 'dealerBust' || outcome === 'blackjack'
      const isLoss = outcome === 'lose' || outcome === 'bust'

      return {
        ...state,
        bankroll: newBankroll,
        ownedAssets: newOwnedAssets,
        bettedAssets: [],
        chipStack: [],
        phase: 'result',
        result: outcome,
        handsPlayed: state.handsPlayed + 1,
        winStreak: isWin ? state.winStreak + 1 : (isLoss ? 0 : state.winStreak),
        loseStreak: isLoss ? state.loseStreak + 1 : (isWin ? 0 : state.loseStreak),
        totalWon: isWin ? state.totalWon + delta : state.totalWon,
        totalLost: isLoss ? state.totalLost + Math.abs(delta) : state.totalLost,
        peakBankroll: Math.max(state.peakBankroll, newBankroll),
        lowestBankroll: Math.min(state.lowestBankroll, newBankroll),
      }
    }

    case NEW_ROUND: {
      if (state.phase !== 'result') return state

      const deck = state.deck.length < RESHUFFLE_THRESHOLD
        ? shuffle(createDeck())
        : state.deck

      return {
        ...state,
        deck,
        playerHand: [],
        dealerHand: [],
        currentBet: 0,
        chipStack: [],
        bettedAssets: [],
        phase: 'betting',
        result: null,
        isDoubledDown: false,
        isAllIn: false,
        dealerMessage: '',
        showAssetMenu: false,
      }
    }

    case RESET_GAME: {
      return createInitialState()
    }

    case TOGGLE_ASSET_MENU: {
      return { ...state, showAssetMenu: !state.showAssetMenu }
    }

    case TOGGLE_ACHIEVEMENTS: {
      return { ...state, showAchievements: !state.showAchievements }
    }

    case DISMISS_ACHIEVEMENT: {
      return { ...state, achievementQueue: state.achievementQueue.slice(1) }
    }

    case DISMISS_LOAN_SHARK: {
      return { ...state, loanSharkMessage: null }
    }

    case UNLOCK_ACHIEVEMENT: {
      if (state.unlockedAchievements.includes(action.id)) return state
      return {
        ...state,
        unlockedAchievements: [...state.unlockedAchievements, action.id],
        achievementQueue: [...state.achievementQueue, action.id],
      }
    }

    case TOGGLE_MUTE: {
      return { ...state, muted: !state.muted }
    }

    default:
      return state
  }
}
