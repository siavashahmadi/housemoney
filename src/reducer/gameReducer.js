import {
  ADD_CHIP, UNDO_CHIP, CLEAR_CHIPS, SELECT_CHIP, ALL_IN,
  DEAL, BET_ASSET, REMOVE_ASSET, HIT, STAND, DOUBLE_DOWN, SPLIT, DEALER_DRAW,
  RESOLVE_HAND, NEW_ROUND, RESET_GAME, TAKE_LOAN, DISMISS_TABLE_TOAST,
  ACCEPT_TABLE_UPGRADE, DECLINE_TABLE_UPGRADE,
  TOGGLE_ASSET_MENU, TOGGLE_ACHIEVEMENTS,
  DISMISS_ACHIEVEMENT, DISMISS_LOAN_SHARK, UNLOCK_ACHIEVEMENT, LOAD_ACHIEVEMENTS,
  TOGGLE_MUTE, TOGGLE_NOTIFICATIONS, TOGGLE_DEBT_TRACKER, SET_DEALER_MESSAGE, SET_LOAN_SHARK_MESSAGE,
  LOAD_HIGHEST_DEBT,
} from './actions'
import { createInitialState, createHandObject } from './initialState'
import { BLACKJACK_PAYOUT, RESHUFFLE_THRESHOLD, MAX_SPLIT_HANDS } from '../constants/gameConfig'
import { getTableLevel, getTableChips, TABLE_LEVELS } from '../constants/tableLevels'
import { handValue, isBlackjack, isWinResult, isLossResult } from '../utils/cardUtils'
import { decomposeIntoChips, sumChipStack } from '../utils/chipUtils'
import { getVigRate } from '../constants/vigRates'
import { ASSETS } from '../constants/assets'
import { RESULTS } from '../constants/results'

const MAX_BANKROLL_HISTORY = 500

function computeVig(additionalBet, bankroll, committedBets = 0) {
  const effectiveBankroll = Math.max(0, bankroll - committedBets)
  const borrowedAmount = Math.max(0, additionalBet - effectiveBankroll)
  const vigRate = borrowedAmount > 0 ? getVigRate(bankroll) : 0
  return { vigAmount: Math.floor(borrowedAmount * vigRate), vigRate }
}

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
    const allBust = playerHands.every(h => h.status === RESULTS.BUST)
    return {
      activeHandIndex: currentIndex,
      phase: allBust ? 'result' : 'dealerTurn',
      result: allBust ? RESULTS.BUST : null,
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
  if (outcomes.includes(RESULTS.BLACKJACK)) return RESULTS.BLACKJACK
  const hasWin = outcomes.some(o => o === RESULTS.WIN || o === RESULTS.DEALER_BUST)
  const hasLoss = outcomes.some(o => o === RESULTS.LOSE || o === RESULTS.BUST)
  const hasPush = outcomes.some(o => o === RESULTS.PUSH)
  if (hasWin && hasLoss) return RESULTS.MIXED
  if (hasWin && hasPush) return RESULTS.MIXED
  if (hasWin) return outcomes.includes(RESULTS.DEALER_BUST) ? RESULTS.DEALER_BUST : RESULTS.WIN
  if (outcomes.every(o => o === RESULTS.PUSH)) return RESULTS.PUSH
  if (hasLoss && hasPush) return RESULTS.MIXED
  if (hasLoss) return outcomes.every(o => o === RESULTS.BUST) ? RESULTS.BUST : RESULTS.LOSE
  return RESULTS.MIXED
}

function createSplitHandPair(splitHand, splitCards, isAces) {
  const hand1 = createHandObject([splitHand.cards[0], splitCards[0]], splitHand.bet)
  const hand2 = createHandObject([splitHand.cards[1], splitCards[1]], splitHand.bet)

  if (isAces) {
    hand1.isSplitAces = true
    hand2.isSplitAces = true
    hand1.status = 'standing'
    hand2.status = 'standing'
  } else {
    if (handValue(hand1.cards) === 21) hand1.status = 'standing'
    if (handValue(hand2.cards) === 21) hand2.status = 'standing'
  }
  return [hand1, hand2]
}

function advanceAfterSplit(hands, activeIndex) {
  if (hands[activeIndex].status === 'playing') {
    return { phase: 'playing', result: null, activeHandIndex: activeIndex }
  }
  let idx = activeIndex
  while (idx < hands.length && hands[idx].status !== 'playing') idx++
  if (idx >= hands.length) {
    const allBust = hands.every(h => h.status === RESULTS.BUST)
    return { phase: allBust ? 'result' : 'dealerTurn', result: allBust ? RESULTS.BUST : null, activeHandIndex: activeIndex }
  }
  return { phase: 'playing', result: null, activeHandIndex: idx }
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
      const newStack = state.chipStack.slice(0, -1)
      return { ...state, chipStack: newStack, isAllIn: newStack.length === 0 ? false : state.isAllIn }
    }

    case CLEAR_CHIPS: {
      if (state.phase !== 'betting') return state
      return { ...state, chipStack: [], isAllIn: false }
    }

    case SELECT_CHIP: {
      return { ...state, selectedChipValue: action.value }
    }

    case ALL_IN: {
      if (state.phase !== 'betting') return state
      // Block when bankroll < minBet and not in debt mode
      const allInMinBet = TABLE_LEVELS[state.tableLevel].minBet
      if (state.bankroll < allInMinBet && !state.inDebtMode) return state
      let allInAmount
      if (state.inDebtMode) {
        // "HAIL MARY" — bet the full debt amount, luring the player into thinking they can win it all back
        allInAmount = Math.abs(state.bankroll)
      } else {
        allInAmount = state.bankroll
      }
      const chipStack = decomposeIntoChips(allInAmount)
      return { ...state, chipStack, isAllIn: true }
    }

    case DEAL: {
      if (state.phase !== 'betting') return state
      const assetValue = state.bettedAssets.reduce((sum, a) => sum + a.value, 0)
      if (sumChipStack(state.chipStack) + assetValue < TABLE_LEVELS[state.tableLevel].minBet) return state
      if (!action.cards || action.cards.length !== 4) return state

      const betAmount = sumChipStack(state.chipStack)

      // Vig calculation — charge interest on borrowed portion of cash bet
      const { vigAmount, vigRate } = computeVig(betAmount, state.bankroll)

      const playerCards = [action.cards[0], action.cards[2]]
      const dealerHand = [action.cards[1], action.cards[3]]
      const deck = action.freshDeck || state.deck.slice(4)

      const playerBJ = isBlackjack(playerCards)
      const dealerBJ = isBlackjack(dealerHand)

      let phase = 'playing'
      let result = null
      let handResult = null

      if (playerBJ && dealerBJ) {
        phase = 'result'
        result = RESULTS.PUSH
        handResult = RESULTS.PUSH
      } else if (playerBJ) {
        phase = 'result'
        result = RESULTS.BLACKJACK
        handResult = RESULTS.BLACKJACK
      } else if (dealerBJ) {
        phase = 'result'
        result = RESULTS.LOSE
        handResult = RESULTS.LOSE
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
      if (!action.card && !action.freshDeck) return state
      const hand = activeHand(state)
      if (!hand || hand.isDoubledDown || hand.isSplitAces) return state

      const hitCard = action.card || action.freshDeck[0]
      const hitDeck = action.card ? state.deck.slice(1) : action.freshDeck.slice(1)

      const newCards = [...hand.cards, hitCard]
      const value = handValue(newCards)
      const isBust = value > 21

      const playerHands = updateActiveHand(state, {
        cards: newCards,
        status: isBust ? RESULTS.BUST : 'playing',
        result: isBust ? RESULTS.BUST : null,
      })

      if (isBust) {
        const advancement = advanceToNextHand(state.activeHandIndex, playerHands)
        return { ...state, playerHands, deck: hitDeck, ...advancement }
      }

      // Auto-stand on 21 to prevent accidental bust
      if (value === 21) {
        const autoStandHands = playerHands.map((h, i) =>
          i === state.activeHandIndex ? { ...h, status: 'standing' } : h
        )
        const advancement = advanceToNextHand(state.activeHandIndex, autoStandHands)
        return { ...state, playerHands: autoStandHands, deck: hitDeck, ...advancement }
      }

      return { ...state, playerHands, deck: hitDeck }
    }

    case STAND: {
      if (state.phase !== 'playing') return state
      const playerHands = updateActiveHand(state, { status: 'standing' })
      const advancement = advanceToNextHand(state.activeHandIndex, playerHands)
      return { ...state, playerHands, ...advancement }
    }

    case DOUBLE_DOWN: {
      if (state.phase !== 'playing') return state
      if (!action.card && !action.freshDeck) return state
      const hand = activeHand(state)
      if (!hand || hand.cards.length !== 2) return state
      if (hand.isSplitAces) return state
      // Block doubling a pure asset bet — there are no chips to double
      if (hand.bet === 0) return state
      // Debt gate: block doubling when it would push bankroll negative without debt mode
      if (state.bankroll - hand.bet < 0 && !state.inDebtMode) return state

      const ddCard = action.card || action.freshDeck[0]
      const ddDeck = action.card ? state.deck.slice(1) : action.freshDeck.slice(1)

      // Vig on the additional bet (same amount as original hand bet)
      const totalCommitted = state.playerHands.reduce((sum, h) => sum + h.bet, 0)
      const { vigAmount } = computeVig(hand.bet, state.bankroll, totalCommitted)

      const newCards = [...hand.cards, ddCard]
      const value = handValue(newCards)
      const isBust = value > 21

      const playerHands = updateActiveHand(state, {
        cards: newCards,
        bet: hand.bet * 2,
        isDoubledDown: true,
        status: isBust ? RESULTS.BUST : 'standing',
        result: isBust ? RESULTS.BUST : null,
      })

      const advancement = advanceToNextHand(state.activeHandIndex, playerHands)
      return {
        ...state,
        playerHands,
        deck: ddDeck,
        bankroll: state.bankroll - vigAmount,
        vigAmount: state.vigAmount + vigAmount,
        totalVigPaid: state.totalVigPaid + vigAmount,
        ...advancement,
      }
    }

    case SPLIT: {
      if (state.phase !== 'playing') return state
      if (state.playerHands.length >= MAX_SPLIT_HANDS) return state
      if (!action.cards && !action.freshDeck) return state

      const splitCards = action.cards || action.freshDeck.slice(0, 2)
      const splitDeck = action.cards ? state.deck.slice(2) : action.freshDeck.slice(2)

      if (splitCards.length !== 2) return state

      const splitHand = activeHand(state)
      if (!splitHand || splitHand.cards.length !== 2) return state
      if (splitHand.cards[0].rank !== splitHand.cards[1].rank) return state
      if (splitHand.isSplitAces) return state
      if (splitHand.bet === 0) return state
      if (state.bankroll - splitHand.bet < 0 && !state.inDebtMode) return state

      const isAces = splitHand.cards[0].rank === 'A' && splitHand.cards[1].rank === 'A'
      const [hand1, hand2] = createSplitHandPair(splitHand, splitCards, isAces)

      const newHands = [
        ...state.playerHands.slice(0, state.activeHandIndex),
        hand1,
        hand2,
        ...state.playerHands.slice(state.activeHandIndex + 1),
      ]

      const totalCommitted = state.playerHands.reduce((sum, h) => sum + h.bet, 0)
      const { vigAmount } = computeVig(splitHand.bet, state.bankroll, totalCommitted)
      const advancement = advanceAfterSplit(newHands, state.activeHandIndex)

      return {
        ...state,
        playerHands: newHands,
        deck: splitDeck,
        bankroll: state.bankroll - vigAmount,
        vigAmount: state.vigAmount + vigAmount,
        totalVigPaid: state.totalVigPaid + vigAmount,
        ...advancement,
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
      // Guard against double-dispatch (no bet exists to settle)
      if (state.phase === 'result' && state.chipStack.length === 0 && state.bettedAssets.length === 0) return state

      const { outcomes } = action
      const assetValue = state.bettedAssets.reduce((sum, a) => sum + a.value, 0)

      // Process each hand
      let totalDelta = 0
      const resolvedHands = state.playerHands.map((hand, i) => {
        const outcome = outcomes[i] || RESULTS.PUSH
        // Assets only apply to first hand's payout
        const handBet = hand.bet + (i === 0 ? assetValue : 0)

        let delta = 0
        switch (outcome) {
          case RESULTS.BLACKJACK:
            delta = Math.floor(BLACKJACK_PAYOUT * handBet)
            break
          case RESULTS.WIN:
          case RESULTS.DEALER_BUST:
            delta = handBet
            break
          case RESULTS.PUSH:
            delta = 0
            break
          case RESULTS.LOSE:
          case RESULTS.BUST:
            delta = -handBet
            break
        }
        totalDelta += delta
        return { ...hand, result: outcome, status: 'done', payout: delta }
      })

      const newBankroll = state.bankroll + totalDelta

      // Handle assets: tied to hand[0], return if hand[0] wins/pushes
      const hand0Result = outcomes[0]
      const hand0Win = hand0Result === RESULTS.WIN || hand0Result === RESULTS.DEALER_BUST ||
        hand0Result === RESULTS.BLACKJACK || hand0Result === RESULTS.PUSH
      const newOwnedAssets = { ...state.ownedAssets }
      if (hand0Win) {
        for (const asset of state.bettedAssets) {
          newOwnedAssets[asset.id] = true
        }
      }

      const aggregateResult = determineAggregateResult(outcomes)
      const isWin = isWinResult(aggregateResult)
      const isLoss = isLossResult(aggregateResult)
      const isMixed = aggregateResult === RESULTS.MIXED

      // Table level progression
      const computedLevel = getTableLevel(newBankroll)
      let newTableLevel = state.tableLevel
      let tableLevelChanged = null
      let pendingTableUpgrade = state.pendingTableUpgrade
      let declinedTableUpgrade = state.declinedTableUpgrade
      let selectedChipValue = state.selectedChipValue

      if (computedLevel !== state.tableLevel) {
        if (computedLevel < state.tableLevel) {
          // Downgrade: apply immediately
          newTableLevel = computedLevel
          tableLevelChanged = { from: state.tableLevel, to: computedLevel }
          pendingTableUpgrade = null
          declinedTableUpgrade = null
          const downgradeChips = getTableChips(computedLevel, newBankroll)
          const downgradeValues = downgradeChips.map(c => c.value)
          selectedChipValue = downgradeValues.includes(selectedChipValue)
            ? selectedChipValue : downgradeValues[0]
        } else if (declinedTableUpgrade !== computedLevel) {
          // Upgrade: show modal instead of auto-switching
          pendingTableUpgrade = { from: state.tableLevel, to: computedLevel }
        }
      } else {
        // Still at current level — clear declined if bankroll dropped below that threshold
        if (declinedTableUpgrade !== null && computedLevel < declinedTableUpgrade) {
          declinedTableUpgrade = null
        }
      }

      // Exit debt mode if bankroll recovered to >= minBet
      const resolveMinBet = TABLE_LEVELS[newTableLevel].minBet
      const newInDebtMode = state.inDebtMode && newBankroll < resolveMinBet

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
        pendingTableUpgrade,
        declinedTableUpgrade,
        selectedChipValue,
        handsPlayed: state.handsPlayed + 1,
        winStreak: isWin ? state.winStreak + 1 : (isLoss || isMixed ? 0 : state.winStreak),
        loseStreak: isLoss ? state.loseStreak + 1 : (isWin || isMixed ? 0 : state.loseStreak),
        totalWon: totalDelta > 0 ? state.totalWon + totalDelta : state.totalWon,
        totalLost: totalDelta < 0 ? state.totalLost + Math.abs(totalDelta) : state.totalLost,
        peakBankroll: Math.max(state.peakBankroll, newBankroll),
        lowestBankroll: Math.min(state.lowestBankroll, newBankroll),
        bankrollHistory: state.bankrollHistory.length >= MAX_BANKROLL_HISTORY
          ? [...state.bankrollHistory.slice(-(MAX_BANKROLL_HISTORY - 1)), newBankroll]
          : [...state.bankrollHistory, newBankroll],
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

    case ACCEPT_TABLE_UPGRADE: {
      if (!state.pendingTableUpgrade) return state
      const { from, to } = state.pendingTableUpgrade
      const upgradeChips = getTableChips(to, state.bankroll)
      const upgradeValues = upgradeChips.map(c => c.value)
      const chipValue = upgradeValues.includes(state.selectedChipValue)
        ? state.selectedChipValue : upgradeValues[0]
      return {
        ...state,
        tableLevel: to,
        tableLevelChanged: { from, to },
        pendingTableUpgrade: null,
        declinedTableUpgrade: null,
        selectedChipValue: chipValue,
      }
    }

    case DECLINE_TABLE_UPGRADE: {
      if (!state.pendingTableUpgrade) return state
      return {
        ...state,
        pendingTableUpgrade: null,
        declinedTableUpgrade: state.pendingTableUpgrade.to,
      }
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
      // During playing phase, always allow loan (mid-hand loan for split/double)
      // The bankroll may be above minBet but below the hand bet needed for split/double
      if (state.phase === 'playing') {
        return { ...state, inDebtMode: true }
      }
      // Betting phase: only allow loan when bankroll < minBet and no available assets
      const loanMinBet = TABLE_LEVELS[state.tableLevel].minBet
      if (state.bankroll >= loanMinBet) return state
      const hasUnlockedAssets = ASSETS.some(
        a => state.bankroll <= a.unlockThreshold && state.ownedAssets[a.id] && !state.bettedAssets.some(b => b.id === a.id)
      )
      if (hasUnlockedAssets) return state
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
