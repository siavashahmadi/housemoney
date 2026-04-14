import React, { useEffect, useState } from 'react'
import { SLOT_SYMBOLS } from '../../constants/slotSymbols'
import styles from './SlotReel.module.css'

const SYMBOL_COUNT = SLOT_SYMBOLS.length // 7
const REPEAT_COUNT = 6
const LANDING_DURATION = 650 // slightly > CSS transition (0.6s)

// Build static strip: 7 symbols × 6 repetitions = 42 items
const SYMBOL_STRIP = Array.from({ length: REPEAT_COUNT }, () => SLOT_SYMBOLS).flat()

function SlotReel({ targetSymbol, spinning, delay = 0, onStop }) {
  // Animation state machine: idle → spinning → landing → stopped
  const [animState, setAnimState] = useState('idle')

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (spinning && animState === 'idle') {
      setAnimState('spinning')

      const landTimer = setTimeout(() => {
        setAnimState('landing')
      }, 800 + delay)

      // Use timeout instead of transitionend — CSS animation→transition
      // handoff in the same paint doesn't reliably fire transitionend.
      const stopTimer = setTimeout(() => {
        setAnimState('stopped')
        if (onStop) onStop()
      }, 800 + delay + LANDING_DURATION)

      return () => {
        clearTimeout(landTimer)
        clearTimeout(stopTimer)
      }
    }
  }, [spinning, delay]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset to idle when spinning goes false after stopped
  useEffect(() => {
    if (!spinning && animState === 'stopped') {
      setAnimState('idle')
    }
  }, [spinning, animState])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Determine CSS class for strip
  const stripClass = [
    styles.strip,
    animState === 'spinning' ? styles.spinning : '',
    animState === 'landing' ? styles.landing : '',
    animState === 'stopped' ? styles.stopped : '',
    animState === 'idle' ? styles.idle : '',
  ]
    .filter(Boolean)
    .join(' ')

  // Calculate final position from targetSymbol (derived, not stored in ref)
  const targetIndex = targetSymbol ? targetSymbol.index : 0
  const targetPos = 4 * SYMBOL_COUNT + targetIndex
  const finalY = -(targetPos - 1)

  // Apply transform during landing/stopped (animation lifecycle) and
  // idle-with-result (keeps symbols visible after resolve). Don't apply
  // during spinning (CSS animation drives position) or the brief idle
  // frame when a new spin starts (would flash the new result).
  const stripStyle =
    targetSymbol && (animState === 'landing' || animState === 'stopped' || (animState === 'idle' && !spinning))
      ? { transform: `translateY(calc(${finalY} * var(--symbol-height)))` }
      : {}

  return (
    <div className={styles.reel}>
      <div
        className={stripClass}
        style={stripStyle}
      >
        {SYMBOL_STRIP.map((symbol, i) => (
          <div key={i} className={styles.symbol} aria-hidden="true">
            {symbol.emoji}
          </div>
        ))}
      </div>
      <div className={styles.payline} aria-hidden="true" />
    </div>
  )
}

export default React.memo(SlotReel)
