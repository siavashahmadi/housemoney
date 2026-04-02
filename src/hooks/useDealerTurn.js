import { useEffect } from 'react'
import { handValue, isSoft, determineOutcome, createDeck, shuffle } from '../utils/cardUtils'
import { dealerDraw, resolveHand } from '../reducer/actions'
import { DEALER_HIT_DELAY, DEALER_STAND_DELAY } from '../constants/gameConfig'
import { RESULTS } from '../constants/results'

export function useDealerTurn(state, dispatch) {
  // Handle dealer turn — sequential card draws
  useEffect(() => {
    if (state.phase !== 'dealerTurn') return

    const dealerVal = handValue(state.dealerHand)
    const soft = isSoft(state.dealerHand)

    // Dealer hits on soft 17, stands on hard 17+
    if (dealerVal < 17 || (dealerVal === 17 && soft)) {
      const timeout = setTimeout(() => {
        if (state.deck.length === 0) {
          dispatch(dealerDraw(null, shuffle(createDeck())))
        } else {
          dispatch(dealerDraw(state.deck[0]))
        }
      }, DEALER_HIT_DELAY)
      return () => clearTimeout(timeout)
    } else {
      // Dealer stands — resolve all player hands
      const timeout = setTimeout(() => {
        const outcomes = state.playerHands.map(hand => {
          if (hand.result === RESULTS.BUST) return RESULTS.BUST
          return determineOutcome(hand.cards, state.dealerHand)
        })
        dispatch(resolveHand(outcomes))
      }, DEALER_STAND_DELAY)
      return () => clearTimeout(timeout)
    }
  }, [state.phase, state.dealerHand, dispatch])

  // Handle natural blackjack / all-bust resolution
  // DEAL sets phase='result' with result set, but doesn't update bankroll/stats.
  // We need to dispatch RESOLVE_HAND to settle the bet.
  useEffect(() => {
    if (
      state.phase === 'result' &&
      state.result !== null &&
      (state.chipStack.length > 0 || state.bettedAssets.length > 0)
    ) {
      // Build outcomes from existing hand results
      const outcomes = state.playerHands.map(h => h.result || state.result)
      const timeout = setTimeout(() => {
        dispatch(resolveHand(outcomes))
      }, 300)
      return () => clearTimeout(timeout)
    }
  }, [state.phase, state.result, state.chipStack.length, state.bettedAssets.length, dispatch])
}
