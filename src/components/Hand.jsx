import { memo, useRef, useEffect } from 'react'
import Card from './Card'
import styles from './Hand.module.css'

function getCardMargin(cardCount, cardIndex, size) {
  if (cardIndex === 0) return 0
  if (size === 'small') {
    return -30
  }
  if (size === 'medium') {
    if (cardCount <= 2) return -20
    return -38
  }
  if (cardCount <= 2) return 10
  if (cardCount === 3) return 0
  if (cardCount === 4) return -15
  if (cardCount === 5) return -25
  return -35
}

const Hand = memo(function Hand({ cards = [], hideFirst = false, animate = true, size = 'normal', dealType = 'deal', flipIndex = -1 }) {
  const cardCount = cards.length
  // Track cards already rendered so only new cards get deal animations
  const knownCardsRef = useRef(new Set())

  // Compute which cards are new directly from the ref each render.
  // Cannot use useMemo here — the ref updates via useEffect after render,
  // but useMemo would return a stale cached result if cards ref is unchanged.
  const newCardIds = new Set()
  const newCardStagger = new Map()
  let staggerIdx = 0
  cards.forEach(c => {
    if (!knownCardsRef.current.has(c.id)) {
      newCardIds.add(c.id)
      newCardStagger.set(c.id, staggerIdx++)
    }
  })

  useEffect(() => {
    if (cards.length === 0) {
      knownCardsRef.current.clear()
    } else {
      cards.forEach(c => knownCardsRef.current.add(c.id))
    }
  }, [cards])

  return (
    <div className={styles.hand}>
      {cards.map((card, i) => {
        const isNew = newCardIds.has(card.id)
        const isFlipping = i === flipIndex
        return (
          <div
            key={card.id}
            className={styles.handCard}
            style={{
              marginLeft: getCardMargin(cardCount, i, size),
              zIndex: i,
            }}
          >
            <Card
              card={card}
              faceDown={hideFirst && i === 0}
              index={isNew ? (newCardStagger.get(card.id) || 0) : 0}
              animate={animate && (isNew || isFlipping)}
              size={size}
              dealType={isFlipping ? 'flip' : dealType}
            />
          </div>
        )
      })}
    </div>
  )
})

export default Hand
