import React, { useMemo, useState, useEffect, useRef } from 'react'
import Hand from './Hand'
import DealerSpeechBubble from './DealerSpeechBubble'
import { handValue, cardValue } from '../utils/cardUtils'
import styles from './DealerArea.module.css'

function DealerArea({ hand, phase, hideHoleCard, dealerMessage, deckLength }) {
  const hasCards = hand.length > 0

  // Detect mid-round reshuffle (deck jumps from near-0 to full)
  const prevDeckRef = useRef(deckLength)
  const [showReshuffle, setShowReshuffle] = useState(false)

  useEffect(() => {
    // Detect reshuffle: deck jumps from near-empty to full during any phase
    if (deckLength != null && prevDeckRef.current != null && deckLength - prevDeckRef.current > 200) {
      setShowReshuffle(true)
      const timer = setTimeout(() => setShowReshuffle(false), 1500)
      return () => clearTimeout(timer)
    }
    prevDeckRef.current = deckLength
  }, [deckLength])

  const displayValue = useMemo(() => {
    if (!hasCards) return ''
    if (hideHoleCard) {
      return hand.length > 1 ? cardValue(hand[1]) : ''
    }
    const visibleCards = hand.filter(c => c.rank !== '?')
    if (visibleCards.length === 0) return ''
    return handValue(visibleCards)
  }, [hand, hasCards, hideHoleCard])

  return (
    <div className={styles.area}>
      <div className={styles.speechWrapper}>
        <DealerSpeechBubble message={dealerMessage} />
      </div>
      {showReshuffle && (
        <div className={styles.reshuffleAnimation}>
          <div className={styles.deckHalf + ' ' + styles.deckLeft}>
            <div className={styles.cardBack} />
            <div className={styles.cardBack} />
            <div className={styles.cardBack} />
          </div>
          <div className={styles.deckHalf + ' ' + styles.deckRight}>
            <div className={styles.cardBack} />
            <div className={styles.cardBack} />
            <div className={styles.cardBack} />
          </div>
          <span className={styles.reshuffleLabel}>SHUFFLE</span>
        </div>
      )}
      <span className={styles.label}>DEALER</span>
      <div className={styles.handWrapper}>
        {hasCards ? (
          <Hand cards={hand} hideFirst={hideHoleCard} />
        ) : (
          <div className={styles.empty} />
        )}
      </div>
      {hasCards && (
        <span className={styles.value}>{displayValue}</span>
      )}
    </div>
  )
}

export default React.memo(DealerArea)
