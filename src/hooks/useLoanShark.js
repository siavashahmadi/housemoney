import { useEffect, useRef } from 'react'
import { LOAN_SHARK_THRESHOLDS } from '../constants/loanSharkMessages'
import { setLoanSharkMessage } from '../reducer/actions'

export function useLoanShark(state, dispatch) {
  const prevBankrollRef = useRef(state.bankroll)
  const timerRef = useRef(null)
  const pendingRef = useRef({ messages: [], thresholds: [] })

  useEffect(() => {
    const prevBankroll = prevBankrollRef.current
    prevBankrollRef.current = state.bankroll

    // Only check when bankroll decreased
    if (state.bankroll >= prevBankroll) return
    // Only check when in debt
    if (state.bankroll >= 0) return

    // Find ALL newly crossed thresholds
    const newMessages = []
    const newThresholds = []

    for (const { threshold, message } of LOAN_SHARK_THRESHOLDS) {
      if (
        state.bankroll <= threshold &&
        !state.seenLoanThresholds.includes(threshold) &&
        !pendingRef.current.thresholds.includes(threshold)
      ) {
        newMessages.push(message)
        newThresholds.push(threshold)
      }
    }

    if (newMessages.length > 0) {
      // Accumulate messages across rapid bankroll drops
      pendingRef.current.messages.push(...newMessages)
      pendingRef.current.thresholds.push(...newThresholds)

      // Reset timer — waits 1500ms after last drop so player sees result first
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const allMessages = pendingRef.current.messages
        const allThresholds = [...state.seenLoanThresholds, ...pendingRef.current.thresholds]
        pendingRef.current = { messages: [], thresholds: [] }
        dispatch(setLoanSharkMessage(allMessages, allThresholds))
      }, 1500)
    }
  }, [state.bankroll])

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])
}
