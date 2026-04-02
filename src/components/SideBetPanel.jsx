import React from 'react'
import { SIDE_BET_DEFINITIONS, MAX_SIDE_BETS } from '../constants/sideBets'
import { formatMoney } from '../utils/formatters'
import styles from './SideBetPanel.module.css'

function SideBetPanel({ activeSideBets, onPlace, onRemove, minBet, bankroll, inDebtMode }) {
  const activeTypes = new Set(activeSideBets.map(sb => sb.type))
  const atMax = activeSideBets.length >= MAX_SIDE_BETS
  const canAfford = inDebtMode || bankroll >= minBet

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Side Bets</span>
        <span className={styles.subtitle}>{formatMoney(minBet)} each &middot; max {MAX_SIDE_BETS}</span>
      </div>
      <div className={styles.grid}>
        {SIDE_BET_DEFINITIONS.map(def => {
          const isActive = activeTypes.has(def.type)
          const isJinx = def.type === 'jinxBet'
          const disabled = !isActive && (atMax || !canAfford)

          const payoutLabel = def.payoutTable
            ? Object.entries(def.payoutTable).map(([k, v]) => `${k}=${v}:1`).join(' ')
            : `${def.payout}:1`

          const cardClasses = [
            styles.card,
            isActive ? styles.active : '',
            disabled ? styles.disabled : '',
            isJinx ? styles.jinx : '',
          ].filter(Boolean).join(' ')

          const handleClick = () => {
            if (isActive) {
              onRemove(def.type)
            } else if (!disabled) {
              onPlace(def.type)
            }
          }

          return (
            <button
              key={def.type}
              className={cardClasses}
              onClick={handleClick}
              disabled={disabled && !isActive}
            >
              {isActive && <span className={styles.badge}>ACTIVE</span>}
              <span className={styles.name}>{def.name}</span>
              <span className={styles.description}>{def.description}</span>
              <span className={styles.payout}>{payoutLabel}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default React.memo(SideBetPanel)
