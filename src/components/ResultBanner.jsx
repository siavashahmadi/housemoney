import { useState, useEffect } from 'react'
import { formatMoney } from '../utils/formatters'
import styles from './ResultBanner.module.css'

const RESULT_CONFIG = {
  blackjack: { text: 'BLACKJACK!', colorClass: 'gold' },
  win: { text: 'YOU WIN!', colorClass: 'green' },
  dealerBust: { text: 'DEALER BUSTS!', colorClass: 'green' },
  bust: { text: 'BUST!', colorClass: 'red' },
  lose: { text: 'YOU LOSE', colorClass: 'red' },
  push: { text: 'PUSH', colorClass: 'dim' },
  mixed: { text: 'SPLIT RESULT', colorClass: 'dim' },
}

function getSplitResultText(playerHands) {
  const wins = playerHands.filter(h =>
    h.result === 'win' || h.result === 'dealerBust' || h.result === 'blackjack'
  ).length
  const total = playerHands.length
  if (wins === total) return `WON ALL ${total} HANDS`
  if (wins === 0) return `LOST ALL ${total} HANDS`
  return `WON ${wins} OF ${total} HANDS`
}

function getNextHandText(bankroll) {
  if (bankroll < -1000000) return 'THIS IS FINE 🔥'
  if (bankroll < -100000) return 'ONE MORE. JUST ONE MORE.'
  if (bankroll < -10000) return 'KEEP DIGGING 🕳️'
  if (bankroll <= 0) return 'BET AGAIN (WHY NOT)'
  return 'NEXT HAND'
}

function ResultBanner({ result, bankroll, onNextHand, playerHands = [], autoAdvance = false, nextRoundAt }) {
  const [countdown, setCountdown] = useState(null)
  const config = RESULT_CONFIG[result]
  const isSplit = playerHands.length > 1

  useEffect(() => {
    if (!autoAdvance || !nextRoundAt) return

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((nextRoundAt - Date.now()) / 1000))
      setCountdown(remaining)
    }

    tick()
    const interval = setInterval(tick, 500)
    return () => clearInterval(interval)
  }, [autoAdvance, nextRoundAt])

  if (!config) return null

  const netPayout = playerHands.reduce((sum, h) => sum + (h.payout || 0), 0)

  return (
    <div className={styles.banner}>
      {isSplit && (
        <span className={`${styles.netPayout} ${netPayout >= 0 ? styles.payoutWin : styles.payoutLoss}`}>
          {netPayout >= 0 ? '+' : ''}{formatMoney(netPayout)}
        </span>
      )}
      {autoAdvance ? (
        <span className={styles.countdownText}>
          Next round in {countdown ?? '...'}s
        </span>
      ) : (
        <button className={styles.nextButton} onClick={onNextHand}>
          {getNextHandText(bankroll)}
        </button>
      )}
    </div>
  )
}

export default ResultBanner
