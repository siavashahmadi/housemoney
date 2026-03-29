import {
  ADD_CHIP, UNDO_CHIP, CLEAR_CHIPS, SELECT_CHIP, ALL_IN,
  DEAL, BET_ASSET, REMOVE_ASSET, HIT, STAND, DOUBLE_DOWN, SPLIT, DEALER_DRAW,
  RESOLVE_HAND, NEW_ROUND, RESET_GAME, TAKE_LOAN, DISMISS_TABLE_TOAST,
  TOGGLE_ASSET_MENU, TOGGLE_ACHIEVEMENTS,
  DISMISS_ACHIEVEMENT, DISMISS_LOAN_SHARK, UNLOCK_ACHIEVEMENT, LOAD_ACHIEVEMENTS,
  TOGGLE_MUTE, TOGGLE_NOTIFICATIONS, TOGGLE_DEBT_TRACKER, SET_DEALER_MESSAGE, SET_LOAN_SHARK_MESSAGE,
  LOAD_HIGHEST_DEBT,
} from './actions'
import { createInitialState, createHandObject } from './initialState'
import { CHIPS } from '../constants/chips'
import { BLACKJACK_PAYOUT, RESHUFFLE_THRESHOLD } from '../constants/gameConfig'
import { getTableLevel, TABLE_LEVELS } from '../constants/tableLevels'
import { cardValue, handValue, isBlackjack } from '../utils/cardUtils'
import { getVigRate } from '../constants/vigRates'
import { ASSETS } from '../constants/assets'

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

const MAX_SPLIT_HANDS = 4

// --- playerHands helpers ---

function activeHand(state) {
  return state.playerHands[state.activeHandIndex]
}

function updateActiveHand(state, updates) {
  return state.playerHands.map((h, i) =>
    i === state.activeHandIndex ? { ...h, ...updates } : h
  )
}

function advanceToNextHand(currentIndex, playerHands) {
  let nextIndex = currentIndex + 1
  while (nextIndex < playerHands.length && playerHands[nextIndex].status !== 'playing') {
    nextIndex++
  }
  if (nextIndex >= playerHands.length) {
    // All hands done
    const allBust = playerHands.every(h => h.status === 'bust')
    return {
      activeHandIndex: currentIndex,
      phase: allBust ? 'result' : 'dealerTurn',
      result: allBust ? 'bust' : null,
    }
  }
  return {
    activeHandIndex: nextIndex,
    phase: 'playing',
    result: null,
  }
}

function determineAggregateResult(outcomes) {
  if (outcomes.length === 1) return outcomes[0]
  if (outcomes.includes('blackjack')) return 'blackjack'
  const hasWin = outcomes.some(o => o === 'win' || o === 'dealerBust')
  const hasLoss = outcomes.some(o => o === 'lose' || o === 'bust')
  if (hasWin && hasLoss) return 'mixed'
  if (hasWin) return outcomes.includes('dealerBust') ? 'dealerBust' : 'win'
  if (outcomes.every(o => o === 'push')) return 'push'
  if (hasLoss) return outcomes.every(o => o === 'bust') ? 'bust' : 'lose'
  return 'mixed'
}

/*
 * DEBT GATE FLOW — How assets, debt, and vig interact:
 *
 * 1. Player starts with $10,000 cash + 6 assets.
 * 2. Player loses cash to $0. Chip tray is disabled (ADD_CHIP blocked by bankroll check).
 * 3. At $0, the BettingControls UI shows "BET AN ASSET" overlay (asset gate).
 *    Assets unlock progressively based on bankroll threshold.
 * 4. Player bets an asset as a side bet (BET_ASSET action). The asset's cash value
 *    is added to the bet total alongside any chip bet.
 * 5. If they LOSE: bankroll drops by the total bet amount. Asset is gone.
 *    This negative bankroll unlocks the NEXT asset.
 * 6. The cycle repeats: bet asset → lose → go deeper negative → unlock next asset.
 * 7. When ALL assets are bet/lost and bankroll is $0 or negative:
 *    The "TAKE A LOAN" button appears (loan gate).
 * 8. Player taps TAKE A LOAN → inDebtMode = true → chip tray unlocks permanently.
 *    Now the player can bet freely with borrowed money. Vig applies on borrowed portions.
 * 9. If the player WINS back above $0: inDebtMode resets to false.
 *    If they drop back to $0 with no assets, they must tap TAKE A LOAN again.
 *
 * Key invariant: ADD_CHIP is blocked when bankroll < minBet && !inDebtMode.
 * This forces the player through the asset → loan pipeline before accessing credit.
 */
export function gameReducer(state, action) {
  switch (action.type) {
    case ADD_CHIP: {
      if (state.phase !== 'betting') return state
      // Block chips when bankroll < minBet and not in debt mode (must bet asset or take loan first)
      const addChipMinBet = TABLE_LEVELS[state.tableLevel].minBet
      if (state.bankroll < addChipMinBet && !state.inDebtMode) return state
      // Cap total bet at bankroll when not in debt mode
      const newTotal = sumChipStack(state.chipStack) + action.value
      if (newTotal > state.bankroll && !state.inDebtMode) return state
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
      // Block when bankroll < minBet and not in debt mode
      const allInMinBet = TABLE_LEVELS[state.tableLevel].minBet
      if (state.bankroll < allInMinBet && !state.inDebtMode) return state
      const chipStack = state.bankroll < allInMinBet
        ? decomposeIntoChips(allInMinBet)
        : decomposeIntoChips(state.bankroll)
      return { ...state, chipStack, isAllIn: true }
    }

    case DEAL: {
      if (state.phase !== 'betting') return state
      const assetValue = state.bettedAssets.reduce((sum, a) => sum + a.value, 0)
      if (sumChipStack(state.chipStack) + assetValue < TABLE_LEVELS[state.tableLevel].minBet) return state
      if (!action.cards || action.cards.length !== 4) return state

      const betAmount = sumChipStack(state.chipStack)

      // Vig calculation — charge interest on borrowed portion of cash bet
      const borrowedAmount = Math.max(0, betAmount - Math.max(0, state.bankroll))
      const vigRate = borrowedAmount > 0 ? getVigRate(state.bankroll) : 0
      const vigAmount = Math.floor(borrowedAmount * vigRate)

      const playerCards = [action.cards[0], action.cards[2]]
      const dealerHand = [action.cards[1], action.cards[3]]
      const deck = state.deck.slice(4)

      const playerBJ = isBlackjack(playerCards)
      const dealerBJ = isBlackjack(dealerHand)

      let phase = 'playing'
      let result = null
      let handResult = null

      if (playerBJ && dealerBJ) {
        phase = 'result'
        result = 'push'
        handResult = 'push'
      } else if (playerBJ) {
        phase = 'result'
        result = 'blackjack'
        handResult = 'blackjack'
      } else if (dealerBJ) {
        phase = 'result'
        result = 'lose'
        handResult = 'lose'
      }

      const hand = createHandObject(playerCards, betAmount)
      if (handResult) {
        hand.status = 'done'
        hand.result = handResult
      }

      return {
        ...state,
        deck,
        playerHands: [hand],
        activeHandIndex: 0,
        dealerHand,
        bankroll: state.bankroll - vigAmount,
        vigAmount,
        vigRate,
        totalVigPaid: state.totalVigPaid + vigAmount,
        phase,
        result,
        bankrollHistory: state.bankrollHistory.length === 0
          ? [state.bankroll]
          : state.bankrollHistory,
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

    case REMOVE_ASSET: {
      if (state.phase !== 'betting' && state.phase !== 'playing') return state
      const asset = state.bettedAssets.find(a => a.id === action.assetId)
      if (!asset) return state

      return {
        ...state,
        bettedAssets: state.bettedAssets.filter(a => a.id !== action.assetId),
        ownedAssets: { ...state.ownedAssets, [action.assetId]: true },
      }
    }

    case HIT: {
      if (state.phase !== 'playing') return state
      if (!action.card) return state
      const hand = activeHand(state)
      if (!hand || hand.isDoubledDown || hand.isSplitAces) return state

      const newCards = [...hand.cards, action.card]
      const value = handValue(newCards)
      const isBust = value > 21

      const playerHands = updateActiveHand(state, {
        cards: newCards,
        status: isBust ? 'bust' : 'playing',
        result: isBust ? 'bust' : null,
      })

      if (isBust) {
        const advancement = advanceToNextHand(state.activeHandIndex, playerHands)
        return { ...state, playerHands, deck: state.deck.slice(1), ...advancement }
      }

      // Auto-stand on 21 to prevent accidental bust
      if (value === 21) {
        const autoStandHands = playerHands.map((h, i) =>
          i === state.activeHandIndex ? { ...h, status: 'standing' } : h
        )
        const advancement = advanceToNextHand(state.activeHandIndex, autoStandHands)
        return { ...state, playerHands: autoStandHands, deck: state.deck.slice(1), ...advancement }
      }

      return { ...state, playerHands, deck: state.deck.slice(1) }
    }

    case STAND: {
      if (state.phase !== 'playing') return state
      const playerHands = updateActiveHand(state, { status: 'standing' })
      const advancement = advanceToNextHand(state.activeHandIndex, playerHands)
      return { ...state, playerHands, ...advancement }
    }

    case DOUBLE_DOWN: {
      if (state.phase !== 'playing') return state
      if (!action.card) return state
      const hand = activeHand(state)
      if (!hand || hand.cards.length !== 2) return state
      if (hand.isSplitAces) return state
      // Debt gate: block doubling when it would push bankroll negative without debt mode
      if (state.bankroll - hand.bet < 0 && !state.inDebtMode) return state

      // Vig on the additional bet (same amount as original hand bet)
      const additionalBet = hand.bet
      const totalCommitted = state.playerHands
        .filter((_, i) => i !== state.activeHandIndex)
        .reduce((sum, h) => sum + h.bet, 0)
      const effectiveBankroll = Math.max(0, state.bankroll - totalCommitted)
      const borrowedAmount = Math.max(0, additionalBet - effectiveBankroll)
      const vigRate = borrowedAmount > 0 ? getVigRate(state.bankroll) : 0
      const vigAmount = Math.floor(borrowedAmount * vigRate)

      const newCards = [...hand.cards, action.card]
      const value = handValue(newCards)
      const isBust = value > 21

      const playerHands = updateActiveHand(state, {
        cards: newCards,
        bet: hand.bet * 2,
        isDoubledDown: true,
        status: isBust ? 'bust' : 'standing',
        result: isBust ? 'bust' : null,
      })

      const advancement = advanceToNextHand(state.activeHandIndex, playerHands)
      return {
        ...state,
        playerHands,
        deck: state.deck.slice(1),
        bankroll: state.bankroll - vigAmount,
        vigAmount: state.vigAmount + vigAmount,
        totalVigPaid: state.totalVigPaid + vigAmount,
        ...advancement,
      }
    }

    case SPLIT: {
      if (state.phase !== 'playing') return state
      if (state.playerHands.length >= MAX_SPLIT_HANDS) return state
      if (!action.cards || action.cards.length !== 2) return state

      const splitHand = activeHand(state)
      if (!splitHand || splitHand.cards.length !== 2) return state

      // Cards must have same rank (K-K splittable, but K-Q is not)
      if (splitHand.cards[0].rank !== splitHand.cards[1].rank) return state

      const isAces = splitHand.cards[0].rank === 'A' && splitHand.cards[1].rank === 'A'

      // Cannot re-split aces
      if (splitHand.isSplitAces) return state

      // Debt gate: block split when additional bet would go negative without debt mode
      if (state.bankroll - splitHand.bet < 0 && !state.inDebtMode) return state

      // Create two new hands — each gets one original card + one new dealt card
      const hand1 = createHandObject(
        [splitHand.cards[0], action.cards[0]],
        splitHand.bet
      )
      const hand2 = createHandObject(
        [splitHand.cards[1], action.cards[1]],
        splitHand.bet
      )

      // Vig on the new hand's bet (hand2 is the additional bet)
      const totalCommitted = state.playerHands
        .filter((_, i) => i !== state.activeHandIndex)
        .reduce((sum, h) => sum + h.bet, 0)
      const effectiveBankroll = Math.max(0, state.bankroll - totalCommitted)
      const borrowedAmount = Math.max(0, splitHand.bet - effectiveBankroll)
      const vigRate = borrowedAmount > 0 ? getVigRate(state.bankroll) : 0
      const vigAmount = Math.floor(borrowedAmount * vigRate)

      if (isAces) {
        hand1.isSplitAces = true
        hand2.isSplitAces = true
        // Split aces: each gets exactly one card, auto-stands
        hand1.status = handValue(hand1.cards) > 21 ? 'bust' : 'standing'
        hand1.result = handValue(hand1.cards) > 21 ? 'bust' : null
        hand2.status = handValue(hand2.cards) > 21 ? 'bust' : 'standing'
        hand2.result = handValue(hand2.cards) > 21 ? 'bust' : null
      } else {
        if (handValue(hand1.cards) === 21) {
          hand1.status = 'standing'
        }
        if (handValue(hand2.cards) === 21) {
          hand2.status = 'standing'
        }
      }

      // Replace active hand with two new hands
      const newHands = [
        ...state.playerHands.slice(0, state.activeHandIndex),
        hand1,
        hand2,
        ...state.playerHands.slice(state.activeHandIndex + 1),
      ]

      // Determine phase and active hand index after split
      let newActiveIndex = state.activeHandIndex
      let phase = 'playing'
      let result = null

      // If the first new hand can't be played (standing/bust), advance
      if (newHands[newActiveIndex].status !== 'playing') {
        let nextIdx = newActiveIndex
        while (nextIdx < newHands.length && newHands[nextIdx].status !== 'playing') {
          nextIdx++
        }
        if (nextIdx >= newHands.length) {
          const allBust = newHands.every(h => h.status === 'bust')
          phase = allBust ? 'result' : 'dealerTurn'
          result = allBust ? 'bust' : null
        } else {
          newActiveIndex = nextIdx
        }
      }

      return {
        ...state,
        playerHands: newHands,
        activeHandIndex: newActiveIndex,
        deck: state.deck.slice(2),
        bankroll: state.bankroll - vigAmount,
        vigAmount: state.vigAmount + vigAmount,
        totalVigPaid: state.totalVigPaid + vigAmount,
        phase,
        result,
      }
    }

    case DEALER_DRAW: {
      if (state.phase !== 'dealerTurn') return state
      // Mid-round reshuffle: deck exhausted, use fresh deck
      if (!action.card && action.freshDeck) {
        const newDeck = action.freshDeck
        return {
          ...state,
          dealerHand: [...state.dealerHand, newDeck[0]],
          deck: newDeck.slice(1),
        }
      }
      if (!action.card) return state
      return {
        ...state,
        dealerHand: [...state.dealerHand, action.card],
        deck: state.deck.slice(1),
      }
    }

    case RESOLVE_HAND: {
      // Guard against double-dispatch
      if (state.phase === 'result' && state.chipStack.length === 0) return state

      const { outcomes } = action
      const assetValue = state.bettedAssets.reduce((sum, a) => sum + a.value, 0)

      // Process each hand
      let totalDelta = 0
      const resolvedHands = state.playerHands.map((hand, i) => {
        const outcome = outcomes[i] || 'push'
        // Assets only apply to first hand's payout
        const handBet = hand.bet + (i === 0 ? assetValue : 0)

        let delta = 0
        switch (outcome) {
          case 'blackjack':
            delta = Math.floor(BLACKJACK_PAYOUT * handBet)
            break
          case 'win':
          case 'dealerBust':
            delta = handBet
            break
          case 'push':
            delta = 0
            break
          case 'lose':
          case 'bust':
            delta = -handBet
            break
        }
        totalDelta += delta
        return { ...hand, result: outcome, status: 'done', payout: delta }
      })

      const newBankroll = state.bankroll + totalDelta

      // Handle assets: tied to hand[0], return if hand[0] wins/pushes
      const hand0Result = outcomes[0]
      const hand0Win = hand0Result === 'win' || hand0Result === 'dealerBust' ||
        hand0Result === 'blackjack' || hand0Result === 'push'
      const newOwnedAssets = { ...state.ownedAssets }
      if (hand0Win) {
        for (const asset of state.bettedAssets) {
          newOwnedAssets[asset.id] = true
        }
      }

      const aggregateResult = determineAggregateResult(outcomes)
      const isWin = aggregateResult === 'win' || aggregateResult === 'dealerBust' || aggregateResult === 'blackjack'
      const isLoss = aggregateResult === 'lose' || aggregateResult === 'bust'

      // Exit debt mode if bankroll recovered to >= minBet
      const resolveMinBet = TABLE_LEVELS[newTableLevel].minBet
      const newInDebtMode = state.inDebtMode && newBankroll < resolveMinBet

      // Table level progression (dynamic — based on current bankroll)
      const newTableLevel = getTableLevel(newBankroll)
      const tableLevelChanged = newTableLevel !== state.tableLevel
        ? { from: state.tableLevel, to: newTableLevel }
        : null
      // Auto-correct selectedChipValue if it's not in the new table's chip set
      const newTableChips = TABLE_LEVELS[newTableLevel].chipValues
      const selectedChipValue = newTableChips.includes(state.selectedChipValue)
        ? state.selectedChipValue
        : newTableChips[0]

      return {
        ...state,
        bankroll: newBankroll,
        inDebtMode: newInDebtMode,
        playerHands: resolvedHands,
        ownedAssets: newOwnedAssets,
        bettedAssets: [],
        chipStack: [],
        phase: 'result',
        result: aggregateResult,
        tableLevel: newTableLevel,
        tableLevelChanged,
        selectedChipValue,
        handsPlayed: state.handsPlayed + 1,
        winStreak: isWin ? state.winStreak + 1 : (isLoss ? 0 : state.winStreak),
        loseStreak: isLoss ? state.loseStreak + 1 : (isWin ? 0 : state.loseStreak),
        totalWon: totalDelta > 0 ? state.totalWon + totalDelta : state.totalWon,
        totalLost: totalDelta < 0 ? state.totalLost + Math.abs(totalDelta) : state.totalLost,
        peakBankroll: Math.max(state.peakBankroll, newBankroll),
        lowestBankroll: Math.min(state.lowestBankroll, newBankroll),
        bankrollHistory: [...state.bankrollHistory, newBankroll],
      }
    }

    case NEW_ROUND: {
      if (state.phase !== 'result' || state.chipStack.length > 0) return state

      const deck = state.deck.length < RESHUFFLE_THRESHOLD
        ? action.freshDeck
        : state.deck

      return {
        ...state,
        deck,
        playerHands: [],
        activeHandIndex: 0,
        dealerHand: [],
        chipStack: [],
        bettedAssets: [],
        phase: 'betting',
        result: null,
        isAllIn: false,
        dealerMessage: '',
        showAssetMenu: false,
        vigAmount: 0,
        vigRate: 0,
        tableLevelChanged: null,
      }
    }

    case DISMISS_TABLE_TOAST: {
      return { ...state, tableLevelChanged: null }
    }

    case RESET_GAME: {
      return { ...createInitialState(), deck: action.freshDeck, muted: state.muted, notificationsEnabled: state.notificationsEnabled }
    }

    case TOGGLE_ASSET_MENU: {
      return { ...state, showAssetMenu: !state.showAssetMenu }
    }

    case TOGGLE_ACHIEVEMENTS: {
      return { ...state, showAchievements: !state.showAchievements }
    }

    case TOGGLE_DEBT_TRACKER: {
      return { ...state, showDebtTracker: !state.showDebtTracker }
    }

    case TAKE_LOAN: {
      if (state.phase !== 'betting' && state.phase !== 'playing') return state
      const loanMinBet = TABLE_LEVELS[state.tableLevel].minBet
      if (state.bankroll >= loanMinBet) return state
      // During playing phase, skip asset check (mid-hand loan for split/double)
      if (state.phase === 'betting') {
        const hasUnlockedAssets = ASSETS.some(
          a => state.bankroll <= a.unlockThreshold && (state.ownedAssets[a.id] || state.bettedAssets.some(b => b.id === a.id))
        )
        if (hasUnlockedAssets) return state
      }
      return { ...state, inDebtMode: true }
    }

    case DISMISS_ACHIEVEMENT: {
      return { ...state, achievementQueue: state.achievementQueue.slice(1) }
    }

    case DISMISS_LOAN_SHARK: {
      return { ...state, loanSharkQueue: state.loanSharkQueue.slice(1) }
    }

    case SET_LOAN_SHARK_MESSAGE: {
      return {
        ...state,
        loanSharkQueue: [...state.loanSharkQueue, ...action.messages],
        seenLoanThresholds: action.seenThresholds,
      }
    }

    case UNLOCK_ACHIEVEMENT: {
      if (state.unlockedAchievements.includes(action.id)) return state
      return {
        ...state,
        unlockedAchievements: [...state.unlockedAchievements, action.id],
        achievementQueue: [...state.achievementQueue, action.id],
      }
    }

    case LOAD_ACHIEVEMENTS: {
      return { ...state, unlockedAchievements: action.ids }
    }

    case TOGGLE_MUTE: {
      return { ...state, muted: !state.muted }
    }

    case TOGGLE_NOTIFICATIONS: {
      return { ...state, notificationsEnabled: !state.notificationsEnabled }
    }

    case LOAD_HIGHEST_DEBT: {
      return { ...state, lowestBankroll: Math.min(state.lowestBankroll, action.value) }
    }

    case SET_DEALER_MESSAGE: {
      return {
        ...state,
        dealerMessage: action.message,
        shownDealerLines: action.shownDealerLines,
      }
    }

    default:
      return state
  }
}
