import { memo } from 'react'
import { formatMoney } from '../../utils/formatters'
import { sumChipStack } from '../../utils/chipUtils'
import styles from './SlotsResultBanner.module.css'

const MATCH_CONFIG = {
  triple: { label: 'TRIPLE!', textClass: 'tripleText' },
  pair:   { label: 'PAIR',    textClass: 'pairText'   },
  none:   { label: 'NO MATCH', textClass: 'noneText'  },
}

const SlotsResultBanner = memo(function SlotsResultBanner({
  matchType,
  score,
  payout,
  chipStack,
  bankroll,
  onNextRound,
  onReset,
}) {
  const bet = sumChipStack(chipStack)
  const net = payout - bet
  const config = MATCH_CONFIG[matchType] ?? MATCH_CONFIG.none

  let payoutClass
  if (net > 0) payoutClass = styles.payoutWin
  else if (net < 0) payoutClass = styles.payoutLoss
  else payoutClass = styles.payoutEven

  const netLabel = net > 0
    ? `+${formatMoney(net)}`
    : net < 0
      ? `-${formatMoney(Math.abs(net))}`
      : formatMoney(0)

  return (
    <div className={styles.banner}>
      <span className={`${styles.matchText} ${styles[config.textClass]}`}>
        {config.label}
      </span>

      <span className={`${styles.payout} ${payoutClass}`}>
        {netLabel}
      </span>

      <span className={styles.scoreDetail}>
        Score: {score} | Bet: {formatMoney(bet)} | Return: {formatMoney(payout)}
      </span>

      {bankroll <= 0 ? (
        <button className={styles.nextButton} onClick={onReset}>
          NEW GAME
        </button>
      ) : (
        <button className={styles.nextButton} onClick={onNextRound}>
          SPIN AGAIN
        </button>
      )}
    </div>
  )
})

export default SlotsResultBanner
