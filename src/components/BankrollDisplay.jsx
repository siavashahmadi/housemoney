import { useState, useEffect, useRef } from 'react'
import { formatMoney } from '../utils/formatters'
import { CREDIT_LABEL_TIERS, getCreditTierIndex } from '../constants/creditLabels'
import styles from './BankrollDisplay.module.css'

function getDebtClass(bankroll) {
  if (bankroll < -100000) return styles.debtAggressive
  if (bankroll < -50000) return styles.debtShake
  if (bankroll < -10000) return styles.debtStrong
  if (bankroll < 0) return styles.debtMild
  return ''
}

function BankrollDisplay({ bankroll, currentBetTotal = 0, handsPlayed = 0, vigAmount = 0, vigRate = 0 }) {
  const isNegative = bankroll < 0
  const isOnCredit = bankroll > 0 && currentBetTotal > bankroll
  const debtClass = getDebtClass(bankroll)

  // Escalating credit labels — local UI state
  const [creditLabel, setCreditLabel] = useState('')
  const prevTierRef = useRef(-1)
  const prevHandsRef = useRef(handsPlayed)

  useEffect(() => {
    const tierIndex = getCreditTierIndex(bankroll)
    if (tierIndex >= 0) {
      const tierChanged = tierIndex !== prevTierRef.current
      const roundChanged = handsPlayed !== prevHandsRef.current
      if (tierChanged || roundChanged) {
        const tier = CREDIT_LABEL_TIERS[tierIndex]
        setCreditLabel(tier.labels[Math.floor(Math.random() * tier.labels.length)])
      }
      prevTierRef.current = tierIndex
    } else {
      setCreditLabel('')
      prevTierRef.current = -1
    }
    prevHandsRef.current = handsPlayed
  }, [bankroll, handsPlayed])

  // Vig indicator — transient 2s display
  const [showVig, setShowVig] = useState(false)
  const [displayedVig, setDisplayedVig] = useState({ amount: 0, rate: 0 })

  useEffect(() => {
    if (vigAmount > 0) {
      setDisplayedVig({ amount: vigAmount, rate: vigRate })
      setShowVig(true)
      const timer = setTimeout(() => setShowVig(false), 3000)
      return () => clearTimeout(timer)
    }
    setShowVig(false)
  }, [vigAmount, vigRate])

  const colorClass = isOnCredit
    ? styles.credit
    : isNegative
      ? styles.negative
      : styles.positive

  const hasDebtLabel = isNegative && creditLabel && !isOnCredit

  return (
    <div className={styles.display}>
      <span className={`${styles.amount} ${colorClass} ${debtClass}`}>
        {formatMoney(bankroll)}
      </span>
      {isOnCredit && (
        <span className={styles.creditLabel}>
          BETTING ON CREDIT
        </span>
      )}
      {showVig && displayedVig.amount > 0 && (
        <span className={styles.vigIndicator}>
          Vig: -{formatMoney(displayedVig.amount)} ({Math.round(displayedVig.rate * 100)}%)
        </span>
      )}
      {hasDebtLabel && (
        <span className={styles.debtLabel}>{creditLabel}</span>
      )}
    </div>
  )
}

export default BankrollDisplay
