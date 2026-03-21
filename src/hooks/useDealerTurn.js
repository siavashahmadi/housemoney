import { useEffect } from 'react'
import { handValue, isSoft } from '../utils/cardUtils'
import { dealerDraw, resolveHand } from '../reducer/actions'
import { DEALER_HIT_DELAY, DEALER_STAND_DELAY } from '../constants/gameConfig'

function determineOutcome(playerHand, dealerHand) {
  const playerVal = handValue(playerHand)
  const dealerVal = handValue(dealerHand)
  if (dealerVal > 21) return 'dealerBust'
  if (dealerVal > playerVal) return 'lose'
  if (playerVal > dealerVal) return 'win'
  return 'push'
}

export function useDealerTurn(state, dispatch) {
  // Handle dealer turn — sequential card draws
  useEffect(() => {
    if (state.phase !== 'dealerTurn') return

    const dealerVal = handValue(state.dealerHand)
    const soft = isSoft(state.dealerHand)

    // Dealer hits on soft 17, stands on hard 17+
    if (dealerVal < 17 || (dealerVal === 17 && soft)) {
      const timeout = setTimeout(() => {
        dispatch(dealerDraw(state.deck[0]))
      }, DEALER_HIT_DELAY)
      return () => clearTimeout(timeout)
    } else {
      // Dealer stands — resolve
      const timeout = setTimeout(() => {
        const outcome = determineOutcome(state.playerHand, state.dealerHand)
        dispatch(resolveHand(outcome))
      }, DEALER_STAND_DELAY)
      return () => clearTimeout(timeout)
    }
  }, [state.phase, state.dealerHand, dispatch])

  // Handle natural blackjack resolution
  // DEAL sets phase='result' with result set, but doesn't update bankroll/stats.
  // We need to dispatch RESOLVE_HAND to settle the bet.
  useEffect(() => {
    if (
      state.phase === 'result' &&
      state.result !== null &&
      state.chipStack.length > 0
    ) {
      const timeout = setTimeout(() => {
        dispatch(resolveHand(state.result))
      }, 300)
      return () => clearTimeout(timeout)
    }
  }, [state.phase, state.result, state.chipStack.length, dispatch])
}
