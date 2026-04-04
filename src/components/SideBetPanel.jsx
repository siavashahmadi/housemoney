import React, { useRef, useCallback } from 'react'
import { SIDE_BET_DEFINITIONS } from '../constants/sideBets'
import { formatMoney } from '../utils/formatters'
import styles from './SideBetPanel.module.css'

const LONG_PRESS_MS = 500

function SideBetPanel({ activeSideBets, onPlace, onRemoveChip, onClear, selectedChipValue, bankroll, inDebtMode }) {
  const timerRef = useRef(null)
  const longPressedRef = useRef(false)

  const canAfford = inDebtMode || bankroll >= selectedChipValue

  const handlePointerDown = useCallback((betType) => {
    longPressedRef.current = false
    timerRef.current = setTimeout(() => {
      longPressedRef.current = true
      navigator.vibrate?.(10)
      onRemoveChip(betType)
    }, LONG_PRESS_MS)
  }, [onRemoveChip])

  const handlePointerUp = useCallback((betType, isActive) => {
    clearTimeout(timerRef.current)
    if (longPressedRef.current) return
    if (isActive || canAfford) {
      onPlace(betType)
    }
  }, [onPlace, canAfford])

  const handlePointerLeave = useCallback(() => {
    clearTimeout(timerRef.current)
  }, [])

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Side Bets</span>
        <span className={styles.subtitle}>Tap to wager &middot; hold to undo</span>
      </div>
      <div className={styles.grid}>
        {SIDE_BET_DEFINITIONS.map(def => {
          const activeBet = activeSideBets.find(sb => sb.type === def.type)
          const isActive = !!activeBet
          const isJinx = def.type === 'jinxBet'
          const disabled = !isActive && !canAfford

          const payoutLabel = def.payoutTable
            ? Object.entries(def.payoutTable).map(([k, v]) => `${k}=${v}:1`).join(' ')
            : `${def.payout}:1`

          const cardClasses = [
            styles.card,
            isActive ? styles.active : '',
            disabled ? styles.disabled : '',
            isJinx ? styles.jinx : '',
          ].filter(Boolean).join(' ')

          return (
            <div
              key={def.type}
              className={cardClasses}
              role="button"
              tabIndex={disabled && !isActive ? -1 : 0}
              onPointerDown={() => isActive && handlePointerDown(def.type)}
              onPointerUp={() => handlePointerUp(def.type, isActive)}
              onPointerLeave={handlePointerLeave}
              onContextMenu={(e) => e.preventDefault()}
              aria-disabled={disabled && !isActive}
            >
              {isActive && (
                <>
                  <span className={styles.amountBadge}>{formatMoney(activeBet.amount)}</span>
                  <button
                    className={styles.clearButton}
                    onClick={(e) => { e.stopPropagation(); onClear(def.type) }}
                    aria-label={`Clear ${def.name} bet`}
                  >
                    &times;
                  </button>
                </>
              )}
              <span className={styles.name}>{def.name}</span>
              <span className={styles.description}>{def.description}</span>
              <span className={styles.payout}>{payoutLabel}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default React.memo(SideBetPanel)
