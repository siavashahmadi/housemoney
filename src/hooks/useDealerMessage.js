import { useEffect, useRef } from 'react'
import { setDealerMessage } from '../reducer/actions'
import { selectDealerLine, determineDealerCategory } from '../utils/dealerMessages'

export function useDealerMessage(state, dispatch) {
  const prevStateRef = useRef(state)
  const hasInitRef = useRef(false)

  // Update prev state ref on every render
  useEffect(() => {
    prevStateRef.current = state
  })

  // Greeting on initial mount
  useEffect(() => {
    if (hasInitRef.current) return
    hasInitRef.current = true

    const { message, updatedShownLines } = selectDealerLine(
      'greeting',
      state.shownDealerLines,
      {}
    )
    dispatch(setDealerMessage(message, updatedShownLines))
  }, [dispatch])

  // Resolve-time messages — fires when handsPlayed increments (after RESOLVE_HAND)
  useEffect(() => {
    if (state.handsPlayed === 0) return

    const prevState = prevStateRef.current
    // Only fire when handsPlayed actually incremented
    if (state.handsPlayed <= prevState.handsPlayed && prevState.handsPlayed !== 0) return

    const result = determineDealerCategory(prevState, state, 'resolve')
    if (!result) return

    const { category, context } = result
    const { message, updatedShownLines } = selectDealerLine(
      category,
      state.shownDealerLines,
      context
    )
    dispatch(setDealerMessage(message, updatedShownLines))
  }, [state.handsPlayed, dispatch])

  // Deal-time messages — fires when phase transitions to 'playing'
  useEffect(() => {
    if (state.phase !== 'playing') return

    const prevState = prevStateRef.current
    if (prevState.phase !== 'betting') return

    const result = determineDealerCategory(prevState, state, 'deal')
    if (!result) return

    const { category, context } = result
    const { message, updatedShownLines } = selectDealerLine(
      category,
      state.shownDealerLines,
      context
    )
    dispatch(setDealerMessage(message, updatedShownLines))
  }, [state.phase, dispatch])

  // Asset bet messages — fires when bettedAssets grows
  useEffect(() => {
    if (state.bettedAssets.length === 0) return

    const prevState = prevStateRef.current
    if (state.bettedAssets.length <= prevState.bettedAssets.length) return

    const result = determineDealerCategory(prevState, state, 'betAsset')
    if (!result) return

    const { category, context } = result
    const { message, updatedShownLines } = selectDealerLine(
      category,
      state.shownDealerLines,
      context
    )
    dispatch(setDealerMessage(message, updatedShownLines))
  }, [state.bettedAssets.length, dispatch])

  // Game reset — greeting when handsPlayed drops to 0
  useEffect(() => {
    if (state.handsPlayed !== 0) return

    const prevState = prevStateRef.current
    if (prevState.handsPlayed === 0) return

    const { message, updatedShownLines } = selectDealerLine(
      'greeting',
      state.shownDealerLines,
      {}
    )
    dispatch(setDealerMessage(message, updatedShownLines))
  }, [state.handsPlayed, dispatch])
}
