import { memo, useRef, useEffect } from 'react'
import { m, AnimatePresence } from 'motion/react'
import Card from './Card'
import styles from './Hand.module.css'

const DEAL_ANIMATIONS = {
  deal: {
    initial: { x: 150, y: -100, rotate: -5, scale: 0.4, opacity: 0 },
    animate: { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 },
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  hit: {
    initial: { x: 100, y: -60, rotate: 8, scale: 0.5, opacity: 0 },
    animate: { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 },
    transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  dealerDraw: {
    initial: { x: 60, scale: 0.9, opacity: 0 },
    animate: { x: 0, scale: 1, opacity: 1 },
    transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  flip: {
    animate: { scaleX: [1, 0, 1], scale: [1, 1.05, 1] },
    transition: { duration: 0.3, ease: 'easeInOut' },
  },
}

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
      <AnimatePresence>
        {cards.map((card, i) => {
          const isNew = newCardIds.has(card.id)
          const isFlipping = i === flipIndex
          const shouldAnimate = animate && (isNew || isFlipping)
          const animType = isFlipping ? 'flip' : dealType
          const anim = shouldAnimate && animType ? DEAL_ANIMATIONS[animType] : null
          const staggerDelay = isNew ? (newCardStagger.get(card.id) || 0) * 0.2 : 0
          return (
            <m.div
              key={card.id}
              className={styles.handCard}
              initial={anim ? anim.initial : false}
              animate={anim ? anim.animate : undefined}
              exit={{ opacity: 0, y: -30, scale: 0.8 }}
              transition={anim
                ? { ...anim.transition, delay: staggerDelay, exit: { duration: 0.3 } }
                : { exit: { duration: 0.3 } }
              }
              style={{
                marginLeft: getCardMargin(cardCount, i, size),
                zIndex: i,
              }}
            >
              <Card
                card={card}
                faceDown={hideFirst && i === 0}
                size={size}
              />
            </m.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
})

export default Hand
