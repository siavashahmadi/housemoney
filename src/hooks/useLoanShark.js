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

    // Find ALL newly crossed thresholds and queue their messages
    const newSeenThresholds = [...state.seenLoanThresholds]
    const newMessages = []

    for (const { threshold, message } of LOAN_SHARK_THRESHOLDS) {
      if (
        state.bankroll <= threshold &&
        !state.seenLoanThresholds.includes(threshold)
      ) {
        newMessages.push(message)
        newSeenThresholds.push(threshold)
      }
    }

    if (newMessages.length > 0) {
      // Delay so the player sees the result banner first
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        dispatch(setLoanSharkMessage(newMessages, newSeenThresholds))
      }, 1500)
    }
  }, [state.bankroll])

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])
}
