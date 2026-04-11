import React, { useMemo, useState, useEffect, useRef } from 'react'
import { m } from 'motion/react'
import Hand from './Hand'
import DealerSpeechBubble from './DealerSpeechBubble'
import { handValue, cardValue } from '../utils/cardUtils'
import styles from './DealerArea.module.css'

function DealerArea({ hand, phase, hideHoleCard, dealerMessage, deckLength, dealer }) {
  const hasCards = hand.length > 0

  // Detect mid-round reshuffle (deck jumps from near-0 to full)
  const prevDeckRef = useRef(deckLength)
  const [showReshuffle, setShowReshuffle] = useState(false)

  // Track phase transitions for hole card flip
  const prevPhaseRef = useRef(phase)
  const [flipHoleCard, setFlipHoleCard] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (prevPhaseRef.current === 'playing' && phase === 'dealerTurn') {
      setFlipHoleCard(true)
      const timer = setTimeout(() => setFlipHoleCard(false), 300)
      prevPhaseRef.current = phase
      return () => clearTimeout(timer)
    }
    prevPhaseRef.current = phase
  }, [phase])

  useEffect(() => {
    // Detect reshuffle: deck jumps from near-empty to full during any phase
    if (deckLength != null && prevDeckRef.current != null && deckLength - prevDeckRef.current > 200) {
      setShowReshuffle(true)
      const timer = setTimeout(() => setShowReshuffle(false), 1500)
      return () => clearTimeout(timer)
    }
    prevDeckRef.current = deckLength
  }, [deckLength])
  /* eslint-enable react-hooks/set-state-in-effect */

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
        <DealerSpeechBubble message={dealerMessage} dealerName={dealer?.name} />
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
      <div className={styles.handRow}>
        <div className={styles.handWrapper}>
          {hasCards ? (
            <Hand
              cards={hand}
              hideFirst={hideHoleCard}
              dealType="deal"
              flipIndex={flipHoleCard ? 0 : -1}
            />
          ) : (
            <div className={styles.empty} />
          )}
        </div>
      </div>
      {hasCards && displayValue !== '' ? (
        <m.span
          className={`${styles.value}${displayValue > 21 ? ` ${styles.bust}` : ''}`}
          initial={{ scale: 1.25 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          {displayValue}
        </m.span>
      ) : (
        <span className={styles.value}>{'\u00A0'}</span>
      )}
    </div>
  )
}

export default React.memo(DealerArea)
