import { useEffect, useRef } from 'react'
import { setDealerMessage } from '../reducer/actions'
import { selectDealerLine, determineDealerCategory } from '../utils/dealerMessages'
import { TABLE_LEVELS } from '../constants/tableLevels'
import { usePrevious } from './usePrevious'

export function useDealerMessage(state, dispatch) {
  const prevState = usePrevious(state)
  const hasInitRef = useRef(false)

  // Greeting on initial mount
  useEffect(() => {
    if (hasInitRef.current) return
    hasInitRef.current = true

    const { message, updatedShownLines } = selectDealerLine(
      'greeting',
      state.shownDealerLines,
      {},
      state.currentDealer
    )
    dispatch(setDealerMessage(message, updatedShownLines))
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fire-once greeting via hasInitRef guard
  }, [dispatch])

  // All trigger-based messages in one effect
  useEffect(() => {
    const prev = prevState

    // Determine which trigger fired (check in priority order)
    let category = null
    let context = {}
    let trigger = null

    if (state.handsPlayed > prev.handsPlayed && state.handsPlayed > 0) {
      trigger = 'resolve'
    } else if (state.phase === 'playing' && prev.phase === 'betting') {
      trigger = 'deal'
    } else if (state.bettedAssets.length > prev.bettedAssets.length && state.bettedAssets.length > 0) {
      trigger = 'betAsset'
    } else if (state.playerHands?.length > (prev.playerHands?.length ?? 0) && state.phase === 'playing' && state.playerHands?.length > 1) {
      trigger = 'split'
    } else if (state.inDebtMode && !prev.inDebtMode) {
      category = 'debtActivated'
    } else if (state.tableLevelChanged && !prev.tableLevelChanged) {
      const isUpgrade = state.tableLevelChanged.to > state.tableLevelChanged.from
      category = isUpgrade ? 'tableLevelUp' : 'tableLevelDown'
      context = { tableName: TABLE_LEVELS[state.tableLevelChanged.to].name }
    } else if (state.doubleOrNothing && !prev.doubleOrNothing) {
      category = 'doubleOrNothing'
    } else if (state.handsPlayed === 0 && prev.handsPlayed > 0) {
      // Reset — use returnee if player has been to a higher table
      category = state.highestTableLevel > state.tableLevel ? 'returnee' : 'greeting'
    }

    if (!category && trigger) {
      const result = determineDealerCategory(prev, state, trigger)
      if (result) {
        category = result.category
        context = result.context
      }
    }

    if (category) {
      const { message, updatedShownLines } = selectDealerLine(
        category,
        state.shownDealerLines,
        context,
        state.currentDealer
      )
      dispatch(setDealerMessage(message, updatedShownLines))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally narrow: only fire on specific state transitions, not every dispatch
  }, [
    prevState,
    state.handsPlayed,
    state.phase,
    state.bettedAssets,
    state.playerHands,
    state.inDebtMode,
    state.tableLevelChanged,
    state.doubleOrNothing,
    state.shownDealerLines,
    state.currentDealer,
    state.highestTableLevel,
    state.tableLevel,
    dispatch,
  ])

}
