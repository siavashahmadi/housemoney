import { useEffect, useRef } from 'react'
import { TABLE_LEVELS } from '../constants/tableLevels'
import { isLossResult } from '../utils/cardUtils'
import { offerDoubleOrNothing } from '../reducer/actions'

export function useDoubleOrNothing(state, dispatch) {
  const prevPhaseRef = useRef(state.phase)

  useEffect(() => {
    const prevPhase = prevPhaseRef.current
    prevPhaseRef.current = state.phase

    // Only trigger on transition TO result phase
    if (state.phase !== 'result' || prevPhase === 'result') return

    // Don't re-offer if already active
    if (state.doubleOrNothing) return

    // Must be a loss
    if (!isLossResult(state.result)) return

    // Calculate total loss from all hands
    const totalLoss = state.playerHands.reduce((sum, h) => sum + (h.payout || 0), 0)
    if (totalLoss >= 0) return

    const absLoss = Math.abs(totalLoss)
    const threshold = 10 * TABLE_LEVELS[state.tableLevel].minBet

    if (absLoss < threshold) return

    // Offer after a delay to let result banner show first
    const timer = setTimeout(() => {
      dispatch(offerDoubleOrNothing(absLoss))
    }, 800)

    return () => clearTimeout(timer)
  }, [state.phase, state.result, state.doubleOrNothing, state.playerHands, state.tableLevel, dispatch])
}
