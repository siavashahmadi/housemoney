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
    if (phase === 'dealerTurn' && deckLength - prevDeckRef.current > 200) {
      setShowReshuffle(true)
      const timer = setTimeout(() => setShowReshuffle(false), 1200)
      return () => clearTimeout(timer)
    }
    prevDeckRef.current = deckLength
  }, [deckLength, phase])

  const displayValue = useMemo(() => {
    if (!hasCards) return ''
    if (hideHoleCard) {
      return hand.length > 1 ? cardValue(hand[1]) : ''
    }
    return handValue(hand)
  }, [hand, hasCards, hideHoleCard])

  return (
    <div className={styles.area}>
      <DealerSpeechBubble message={dealerMessage} />
      {showReshuffle && (
        <span className={styles.reshuffleIndicator}>Reshuffling...</span>
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
