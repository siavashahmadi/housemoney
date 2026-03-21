import { CHIPS } from '../constants/chips'
import { MAX_VISUAL_CHIPS } from '../constants/gameConfig'
import { formatMoney } from '../utils/formatters'
import Chip from './Chip'
import styles from './BettingCircle.module.css'

const CHIP_MAP = Object.fromEntries(CHIPS.map(c => [c.value, c]))

function BettingCircle({ chipStack = [], onUndo }) {
  const total = chipStack.reduce((sum, v) => sum + v, 0)
  const isEmpty = chipStack.length === 0
  const visibleChips = chipStack.slice(-MAX_VISUAL_CHIPS)
  const overflowCount = chipStack.length > MAX_VISUAL_CHIPS ? chipStack.length : 0

  return (
    <div className={styles.wrapper}>
      <button
        className={`${styles.circle}${isEmpty ? ` ${styles.empty}` : ''}`}
        onClick={isEmpty ? undefined : onUndo}
      >
        {visibleChips.length > 0 && (
          <div className={styles.chipStack}>
            {visibleChips.map((value, i) => {
              const chip = CHIP_MAP[value] || CHIPS[0]
              const isLast = i === visibleChips.length - 1
              return (
                <div
                  key={`${i}-${value}`}
                  className={styles.stackedChip}
                  style={{
                    transform: `translate(-50%, -50%) translate(${i}px, ${-i * 3}px)`,
                    zIndex: i,
                  }}
                >
                  <Chip
                    label={chip.label}
                    color={chip.color}
                    textColor={chip.textColor}
                    size="stack"
                    animate={isLast}
                  />
                </div>
              )
            })}
          </div>
        )}
        {overflowCount > 0 && (
          <span className={styles.badge}>&times;{overflowCount}</span>
        )}
        {isEmpty && <span className={styles.placeholder}>BET</span>}
      </button>
      {total > 0 && (
        <span className={styles.total}>{formatMoney(total)}</span>
      )}
    </div>
  )
}

export default BettingCircle
