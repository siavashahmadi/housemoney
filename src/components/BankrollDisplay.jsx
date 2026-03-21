import { formatMoney } from '../utils/formatters'
import styles from './BankrollDisplay.module.css'

function BankrollDisplay({ bankroll }) {
  const isNegative = bankroll < 0

  return (
    <div className={styles.display}>
      <span className={`${styles.amount} ${isNegative ? styles.negative : styles.positive}`}>
        {formatMoney(bankroll)}
      </span>
    </div>
  )
}

export default BankrollDisplay
