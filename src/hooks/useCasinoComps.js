import { useEffect, useRef } from 'react'
import { COMP_THRESHOLDS } from '../constants/casinoComps'
import { setCompMessage } from '../reducer/actions'

export function useCasinoComps(state, dispatch) {
  const prevTotalLostRef = useRef(state.totalLost)
  const timerRef = useRef(null)
  const pendingRef = useRef({ messages: [], thresholds: [] })

  useEffect(() => {
    const prevTotalLost = prevTotalLostRef.current
    prevTotalLostRef.current = state.totalLost

    // Only check when totalLost increased
    if (state.totalLost <= prevTotalLost) return

    // Find ALL newly crossed thresholds
    const newMessages = []
    const newThresholds = []

    for (const { threshold, title, message } of COMP_THRESHOLDS) {
      if (
        state.totalLost >= threshold &&
        !state.seenCompThresholds.includes(threshold) &&
        !pendingRef.current.thresholds.includes(threshold)
      ) {
        newMessages.push({ title, message })
        newThresholds.push(threshold)
      }
    }

    if (newMessages.length > 0) {
      // Accumulate messages across rapid totalLost increases
      pendingRef.current.messages.push(...newMessages)
      pendingRef.current.thresholds.push(...newThresholds)

      // Reset timer — waits 1500ms after last increase so player sees result first
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const allMessages = pendingRef.current.messages
        const allThresholds = [...state.seenCompThresholds, ...pendingRef.current.thresholds]
        pendingRef.current = { messages: [], thresholds: [] }
        dispatch(setCompMessage(allMessages, allThresholds))
      }, 1500)
    }
  }, [state.totalLost, dispatch])

  // Reset on game reset (handsPlayed drops to 0)
  useEffect(() => {
    if (state.handsPlayed === 0) {
      clearTimeout(timerRef.current)
      pendingRef.current = { messages: [], thresholds: [] }
      prevTotalLostRef.current = state.totalLost
    }
  }, [state.handsPlayed, state.totalLost])

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])
}
