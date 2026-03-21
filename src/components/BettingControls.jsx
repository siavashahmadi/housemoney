import { MIN_BET } from '../constants/gameConfig'
import ChipTray from './ChipTray'
import styles from './BettingControls.module.css'

function BettingControls({
  bankroll,
  selectedChipValue,
  chipStack,
  onChipTap,
  onUndo,
  onClear,
  onAllIn,
  onDeal,
}) {
  const total = chipStack.reduce((sum, v) => sum + v, 0)
  const canDeal = total >= MIN_BET

  return (
    <div className={styles.controls}>
      <ChipTray
        bankroll={bankroll}
        selectedChipValue={selectedChipValue}
        onChipTap={onChipTap}
      />
      <div className={styles.controlRow}>
        <button
          className={styles.smallButton}
          onClick={onUndo}
          disabled={chipStack.length === 0}
        >
          UNDO
        </button>
        <button
          className={styles.smallButton}
          onClick={onClear}
          disabled={chipStack.length === 0}
        >
          CLEAR
        </button>
        <button className={styles.allInButton} onClick={onAllIn}>
          ALL IN
        </button>
      </div>
      <button
        className={`${styles.dealButton}${!canDeal ? ` ${styles.disabled}` : ''}`}
        onClick={canDeal ? onDeal : undefined}
      >
        DEAL
      </button>
    </div>
  )
}

export default BettingControls
