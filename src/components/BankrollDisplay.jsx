import { formatMoney } from '../utils/formatters'
import styles from './BankrollDisplay.module.css'

function getDebtClass(bankroll) {
  if (bankroll < -100000) return styles.debtAggressive
  if (bankroll < -50000) return styles.debtShake
  if (bankroll < -10000) return styles.debtStrong
  if (bankroll < 0) return styles.debtMild
  return ''
}

function BankrollDisplay({ bankroll, currentBetTotal = 0 }) {
  const isNegative = bankroll < 0
  const isOnCredit = bankroll > 0 && currentBetTotal > bankroll
  const debtClass = getDebtClass(bankroll)

  const colorClass = isOnCredit
    ? styles.credit
    : isNegative
      ? styles.negative
      : styles.positive

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
    </div>
  )
}

export default BankrollDisplay
