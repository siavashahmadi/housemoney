import {
  DEAL, BET_ASSET, REMOVE_ASSET, HIT, STAND, DOUBLE_DOWN, SPLIT,
  DEALER_DRAW, TAKE_LOAN,
} from './actions'
import { createHandObject } from './initialState'
import { MAX_SPLIT_HANDS } from '../constants/gameConfig'
import { TABLE_LEVELS } from '../constants/tableLevels'
import { handValue, cardValue, isBlackjack } from '../utils/cardUtils'
import { sumChipStack } from '../utils/chipUtils'
import { ASSETS } from '../constants/assets'
import { RESULTS } from '../constants/results'
import { SIDE_BET_MAP, SIDE_BET_TYPES, resolvePerfectPair, resolveColorMatch, resolveLuckyLucky } from '../constants/sideBets'
import {
  computeVig, activeHand, updateActiveHand, advanceToNextHand,
  createSplitHandPair, advanceAfterSplit,
} from './reducerHelpers'

export function playReducer(state, action) {
  switch (action.type) {
    case DEAL: {
      if (state.phase !== 'betting') return state
      const assetValue = state.bettedAssets.reduce((sum, a) => sum + a.value, 0)
      if (sumChipStack(state.chipStack) + assetValue < TABLE_LEVELS[state.tableLevel].minBet) return state
      if (!action.cards || action.cards.length !== 4) return state

      const betAmount = sumChipStack(state.chipStack)
      const totalSideBetAmount = state.activeSideBets.reduce((sum, sb) => sum + sb.amount, 0)

      // Vig calculation — charge interest on borrowed portion of total wager (main bet + side bets)
      // Use pre-side-bet-deduction bankroll since side bets were already deducted at placement
      const preSideBetBankroll = state.bankroll + totalSideBetAmount
      const { vigAmount, vigRate } = computeVig(betAmount + totalSideBetAmount, preSideBetBankroll)

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

      // Resolve deal-time side bets
      const dealerUpCard = dealerHand[0]
      let sideBetDelta = 0
      const resolvedSideBets = []
      const deferredSideBets = []

      for (const sb of state.activeSideBets) {
        const def = SIDE_BET_MAP[sb.type]
        if (def && def.resolveAt === 'deal') {
          let won = false
          let payoutMultiplier = 0
          if (sb.type === SIDE_BET_TYPES.PERFECT_PAIR) {
            won = resolvePerfectPair(playerCards)
            payoutMultiplier = won ? def.payout : 0
          } else if (sb.type === SIDE_BET_TYPES.COLOR_MATCH) {
            won = resolveColorMatch(playerCards)
            payoutMultiplier = won ? def.payout : 0
          } else if (sb.type === SIDE_BET_TYPES.LUCKY_LUCKY) {
            const lp = resolveLuckyLucky(playerCards, dealerUpCard)
            won = lp > 0
            payoutMultiplier = lp
          }
          const delta = won ? sb.amount * (payoutMultiplier + 1) : 0
          const displayPayout = won ? sb.amount * payoutMultiplier : -sb.amount
          sideBetDelta += delta
          resolvedSideBets.push({ type: sb.type, amount: sb.amount, won, payout: displayPayout })
        } else {
          deferredSideBets.push(sb)
        }
      }

      return {
        ...state,
        deck,
        playerHands: [hand],
        activeHandIndex: 0,
        dealerHand,
        bankroll: state.bankroll - vigAmount + sideBetDelta,
        vigAmount,
        vigRate,
        totalVigPaid: state.totalVigPaid + vigAmount,
        phase,
        result,
        activeSideBets: deferredSideBets,
        sideBetResults: resolvedSideBets,
        showSideBets: false,
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
      if (cardValue(splitHand.cards[0]) !== cardValue(splitHand.cards[1])) return state
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

    default:
      return null
  }
}
