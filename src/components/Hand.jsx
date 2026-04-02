import { memo } from 'react'
import Card from './Card'
import styles from './Hand.module.css'

function getCardMargin(cardCount, cardIndex, size) {
  if (cardIndex === 0) return 0
  if (size === 'small') {
    if (cardCount <= 2) return 4
    if (cardCount === 3) return -4
    return -12
  }
  if (size === 'medium') {
    if (cardCount <= 2) return 6
    if (cardCount === 3) return -2
    if (cardCount === 4) return -10
    return -18
  }
  if (cardCount <= 2) return 10
  if (cardCount === 3) return 0
  if (cardCount === 4) return -15
  if (cardCount === 5) return -25
  return -35
}

const Hand = memo(function Hand({ cards = [], hideFirst = false, animate = true, size = 'normal', dealType = 'deal', flipIndex = -1 }) {
  const cardCount = cards.length

  return (
    <div className={styles.hand}>
      {cards.map((card, i) => (
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
            index={i}
            animate={animate}
            size={size}
            dealType={i === flipIndex ? 'flip' : dealType}
          />
        </div>
      ))}
    </div>
  )
})

export default Hand
