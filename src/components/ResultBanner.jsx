import React, { useState, useEffect } from 'react'
import { formatMoney } from '../utils/formatters'
import { isWinResult } from '../utils/cardUtils'
import { RESULTS } from '../constants/results'
import styles from './ResultBanner.module.css'

const RESULT_CONFIG = {
  [RESULTS.BLACKJACK]: { text: 'BLACKJACK!', colorClass: 'gold' },
  [RESULTS.WIN]: { text: 'YOU WIN!', colorClass: 'green' },
  [RESULTS.DEALER_BUST]: { text: 'DEALER BUSTS!', colorClass: 'green' },
  [RESULTS.BUST]: { text: 'BUST!', colorClass: 'red' },
  [RESULTS.LOSE]: { text: 'YOU LOSE', colorClass: 'red' },
  [RESULTS.PUSH]: { text: 'PUSH', colorClass: 'dim' },
  [RESULTS.MIXED]: { text: 'SPLIT RESULT', colorClass: 'dim' },
}

function getSplitResultText(playerHands) {
  const wins = playerHands.filter(h => isWinResult(h.result)).length
  const total = playerHands.length
  if (wins === total) return `WON ALL ${total} HANDS`
  if (wins === 0) return `LOST ALL ${total} HANDS`
  return `WON ${wins} OF ${total} HANDS`
}

function getNextHandText(bankroll) {
  if (bankroll < -1000000) return 'THIS IS FINE \u{1F525}'
  if (bankroll < -100000) return 'ONE MORE. JUST ONE MORE.'
  if (bankroll < -10000) return 'KEEP DIGGING \u{1F573}\u{FE0F}'
  if (bankroll <= 0) return 'BET AGAIN (WHY NOT)'
  return 'NEXT HAND'
}

function ResultBanner({ result, bankroll, onNextHand, playerHands = [], autoAdvance = false, nextRoundAt, displayOnly = false }) {
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

  if (displayOnly) {
    return (
      <div className={styles.modal}>
        <span className={`${styles.resultText} ${styles[config.colorClass]}`}>
          {isSplit && result === RESULTS.MIXED ? getSplitResultText(playerHands) : config.text}
        </span>

        {result !== RESULTS.PUSH && (
          <span className={`${styles.payout} ${netPayout >= 0 ? styles.payoutWin : styles.payoutLoss}`}>
            {netPayout >= 0 ? '+' : ''}{formatMoney(Math.abs(netPayout))}
          </span>
        )}

        {isSplit && (
          <div className={styles.splitBreakdown}>
            {playerHands.map((hand, i) => (
              <div key={i} className={styles.splitLine}>
                <span className={styles.splitLabel}>Hand {i + 1}: {RESULT_CONFIG[hand.result]?.text || ''}</span>
                <span className={`${styles.splitPayout} ${(hand.payout || 0) >= 0 ? styles.payoutWin : styles.payoutLoss}`}>
                  {(hand.payout || 0) >= 0 ? '+' : ''}{formatMoney(Math.abs(hand.payout || 0))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={styles.controls}>
      <span className={`${styles.resultText} ${styles[config.colorClass]}`}>
        {isSplit && result === RESULTS.MIXED ? getSplitResultText(playerHands) : config.text}
      </span>

      {result !== RESULTS.PUSH && netPayout !== 0 && (
        <span className={`${styles.payout} ${netPayout >= 0 ? styles.payoutWin : styles.payoutLoss}`}>
          {netPayout >= 0 ? '+' : ''}{formatMoney(Math.abs(netPayout))}
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

export default React.memo(ResultBanner)
