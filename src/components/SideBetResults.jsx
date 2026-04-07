import React from 'react'
import { formatMoney } from '../utils/formatters'
import styles from './SideBetResults.module.css'

function SideBetResults({ results }) {
  if (!results || results.length === 0) return null

  const netPayout = results.reduce((sum, r) => sum + r.payout, 0)

  const isPositive = netPayout > 0
  const isZero = netPayout === 0
  const badgeClass = isPositive ? styles.won : isZero ? styles.push : styles.lost
  const label = isPositive
    ? `Side Bets: +${formatMoney(netPayout)}`
    : isZero
    ? 'Side Bets: Break Even'
    : `Side Bets: ${formatMoney(netPayout)}`

  return (
    <div className={styles.container}>
      <span className={`${styles.badge} ${badgeClass}`}>{label}</span>
    </div>
  )
}

export default React.memo(SideBetResults)
