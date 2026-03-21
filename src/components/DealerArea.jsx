import Hand from './Hand'
import { handValue, cardValue } from '../utils/cardUtils'
import styles from './DealerArea.module.css'

function DealerArea({ hand, phase, hideHoleCard }) {
  const hasCards = hand.length > 0

  let displayValue = ''
  if (hasCards) {
    if (hideHoleCard) {
      // Only show the face-up card value (second card dealt = index 1)
      displayValue = hand.length > 1 ? cardValue(hand[1]) : ''
    } else {
      displayValue = handValue(hand)
    }
  }

  return (
    <div className={styles.area}>
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

export default DealerArea
