import { useCallback, useState } from 'react'
import audioManager from '../utils/audioManager'

let flyingChipId = 0

export function useChipInteraction(dispatch, actions, stateRef, circleRef) {
  const [flyingChips, setFlyingChips] = useState([])

  const handleChipTap = useCallback((value, event) => {
    const s = stateRef.current
    if (actions.shouldBlock?.(s)) return
    navigator.vibrate?.(10)
    const isFirst = s.chipStack.length === 0
    audioManager.play(isFirst ? 'chip_place' : 'chip_stack')
    actions.selectChip(dispatch, value)
    actions.addChip(dispatch, value)

    if (event?.target && circleRef.current) {
      const from = event.target.getBoundingClientRect()
      const to = circleRef.current.getBoundingClientRect()
      const id = ++flyingChipId
      setFlyingChips(prev => [...prev, {
        id, value,
        from: { x: from.left + from.width / 2 - 18, y: from.top + from.height / 2 - 18 },
        to: { x: to.left + to.width / 2 - 18, y: to.top + to.height / 2 - 18 },
      }])
    }
  }, [dispatch, actions, stateRef, circleRef])

  const handleUndo = useCallback(() => {
    const s = stateRef.current
    if (actions.shouldBlockUndo?.(s)) return
    const chipStack = s.chipStack
    if (chipStack.length === 0) return
    const removedValue = chipStack[chipStack.length - 1]

    actions.undo(dispatch)

    if (circleRef.current) {
      const circleRect = circleRef.current.getBoundingClientRect()
      const from = { x: circleRect.left + circleRect.width / 2 - 18, y: circleRect.top + circleRect.height / 2 - 18 }
      const to = { x: from.x, y: from.y + 200 }
      const id = ++flyingChipId
      setFlyingChips(prev => [...prev, {
        id, value: removedValue, from, to, reverse: true,
      }])
    }
  }, [dispatch, actions, stateRef, circleRef])

  const removeFlyingChip = useCallback((id) => {
    setFlyingChips(prev => prev.filter(c => c.id !== id))
  }, [])

  return { flyingChips, handleChipTap, handleUndo, removeFlyingChip }
}
