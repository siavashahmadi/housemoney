import { memo } from 'react'
import { formatMoney } from '../../utils/formatters'
import styles from './SlotsResultBanner.module.css'

const MATCH_CONFIG = {
  triple: { label: 'TRIPLE!', textClass: 'tripleText' },
  pair:   { label: 'PAIR',    textClass: 'pairText'   },
  none:   { label: 'NO MATCH', textClass: 'noneText'  },
}

const SlotsResultBanner = memo(function SlotsResultBanner({
  matchType,
  multiplier,
  payout,
  betAmount,
  bankroll,
  onSpinAgain,
  onChangeBet,
  onReset,
}) {
  const net = payout - betAmount
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

  const multiplierLabel = multiplier > 0 ? `${multiplier}×` : ''

  return (
    <div className={styles.banner}>
      <span className={`${styles.matchText} ${styles[config.textClass]}`}>
        {config.label}{multiplierLabel ? ` ${multiplierLabel}` : ''}
      </span>

      <span className={`${styles.payout} ${payoutClass}`}>
        {netLabel}
      </span>

      <span className={styles.scoreDetail}>
        Bet: {formatMoney(betAmount)} | Return: {formatMoney(payout)}
      </span>

      {bankroll <= 0 ? (
        <button className={styles.nextButton} onClick={onReset}>
          NEW GAME
        </button>
      ) : (
        <div className={styles.buttonRow}>
          <button className={styles.nextButton} onClick={onSpinAgain}>
            SPIN AGAIN
          </button>
          <button className={styles.changeBetButton} onClick={onChangeBet}>
            CHANGE BET
          </button>
        </div>
      )}
    </div>
  )
})

export default SlotsResultBanner
