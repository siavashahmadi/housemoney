import { useEffect, useRef } from 'react'
import { LOAN_SHARK_THRESHOLDS } from '../constants/loanSharkMessages'
import { setLoanSharkMessage } from '../reducer/actions'

export function useLoanShark(state, dispatch) {
  const prevBankrollRef = useRef(state.bankroll)
  const timerRef = useRef(null)

  useEffect(() => {
    const prevBankroll = prevBankrollRef.current
    prevBankrollRef.current = state.bankroll

    // Only check when bankroll decreased
    if (state.bankroll >= prevBankroll) return
    // Only check when in debt
    if (state.bankroll >= 0) return

    // Find newly crossed thresholds — keep only the worst (most severe)
    const newSeenThresholds = [...state.seenLoanThresholds]
    let worstMessage = null

    for (const { threshold, message } of LOAN_SHARK_THRESHOLDS) {
      if (
        state.bankroll <= threshold &&
        !state.seenLoanThresholds.includes(threshold)
      ) {
        worstMessage = message // last match = most severe (thresholds sorted ascending)
        newSeenThresholds.push(threshold)
      }
    }

    if (worstMessage) {
      // Delay so the player sees the result banner first
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        dispatch(setLoanSharkMessage([worstMessage], newSeenThresholds))
      }, 1500)
    }
  }, [state.bankroll])

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])
}
