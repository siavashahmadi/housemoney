import React from 'react'
import { SIDE_BET_MAP } from '../constants/sideBets'
import { formatMoney } from '../utils/formatters'
import styles from './SideBetResults.module.css'

function SideBetResults({ results }) {
  if (!results || results.length === 0) return null

  return (
    <div className={styles.container}>
      {results.map((r, i) => {
        const def = SIDE_BET_MAP[r.type]
        const name = def ? def.name : r.type
        const badgeClass = r.won ? styles.won : styles.lost

        return (
          <span key={`${r.type}-${i}`} className={`${styles.badge} ${badgeClass}`}>
            {name}: {r.won ? `WON +${formatMoney(r.payout)}` : `LOST ${formatMoney(r.payout)}`}
          </span>
        )
      })}
    </div>
  )
}

export default React.memo(SideBetResults)
