import { memo, useMemo } from 'react'
import { SUIT_SYMBOLS, SUIT_COLORS } from '../constants/cards'
import { RESULTS } from '../constants/results'
import { formatMoney } from '../utils/formatters'
import styles from './HandHistory.module.css'

function getResultBadge(result) {
  switch (result) {
    case RESULTS.WIN:
    case RESULTS.DEALER_BUST:
      return { text: 'WIN', className: styles.badgeWin }
    case RESULTS.BLACKJACK:
      return { text: 'BJ', className: styles.badgeWin }
    case RESULTS.LOSE:
    case RESULTS.BUST:
      return { text: result === RESULTS.BUST ? 'BUST' : 'LOSE', className: styles.badgeLose }
    case RESULTS.PUSH:
      return { text: 'PUSH', className: styles.badgePush }
    case RESULTS.MIXED:
      return { text: 'MIXED', className: styles.badgeMixed }
    default:
      return { text: result, className: styles.badgePush }
  }
}

function CardInline({ card }) {
  const symbol = SUIT_SYMBOLS[card.suit]
  const color = SUIT_COLORS[card.suit]
  return (
    <span className={color === 'red' ? styles.cardRed : styles.cardWhite}>
      {card.rank}{symbol}
    </span>
  )
}

function HandHistoryEntry({ entry }) {
  const badge = getResultBadge(entry.result)

  return (
    <div className={styles.entry}>
      <div className={styles.entryHeader}>
        <span className={styles.handNumber}>#{entry.handNumber}</span>
        <span className={`${styles.badge} ${badge.className}`}>{badge.text}</span>
      </div>

      {entry.playerHands.map((hand, i) => (
        <div key={i} className={styles.handRow}>
          <span className={styles.handLabel}>
            {entry.playerHands.length > 1 ? `Hand ${i + 1}` : 'Player'}
            {hand.isDoubledDown ? ' (DD)' : ''}
          </span>
          <span className={styles.cards}>
            {hand.cards.map((card, j) => (
              <CardInline key={j} card={card} />
            ))}
            <span className={styles.handTotal}>= {hand.value}</span>
          </span>
        </div>
      ))}

      <div className={styles.handRow}>
        <span className={styles.handLabel}>Dealer</span>
        <span className={styles.cards}>
          {entry.dealerCards.map((card, j) => (
            <CardInline key={j} card={card} />
          ))}
          <span className={styles.handTotal}>= {entry.dealerValue}</span>
        </span>
      </div>

      <div className={styles.entryFooter}>
        <span className={styles.betInfo}>Bet: {formatMoney(entry.totalBet)}</span>
        <span className={entry.totalDelta >= 0 ? styles.payoutPositive : styles.payoutNegative}>
          {entry.totalDelta >= 0 ? '+' : ''}{formatMoney(entry.totalDelta)}
        </span>
      </div>
    </div>
  )
}

function HandHistory({ handHistory, onClose }) {
  const runningTotal = useMemo(() => {
    return handHistory.reduce((sum, entry) => sum + entry.totalDelta, 0)
  }, [handHistory])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>HAND HISTORY</h2>
          <button className={styles.closeButton} onClick={onClose}>&#x2715;</button>
        </div>

        <div className={styles.scrollArea}>
          {handHistory.length === 0 ? (
            <p className={styles.emptyMessage}>No hands played yet</p>
          ) : (
            handHistory.map(entry => (
              <HandHistoryEntry key={entry.handNumber} entry={entry} />
            ))
          )}
        </div>

        {handHistory.length > 0 && (
          <div className={styles.runningTotal}>
            <span className={styles.runningLabel}>
              Last {handHistory.length} hand{handHistory.length !== 1 ? 's' : ''}:
            </span>
            <span className={runningTotal >= 0 ? styles.runningPositive : styles.runningNegative}>
              {runningTotal >= 0 ? '+' : ''}{formatMoney(runningTotal)}
            </span>
          </div>
        )}

        <div className={styles.closeFooter}>
          <button className={styles.closeFooterButton} onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(HandHistory)
