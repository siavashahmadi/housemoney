import { memo, useEffect } from 'react'
import { TABLE_LEVELS } from '../constants/tableLevels'
import styles from './TableLevelToast.module.css'

function TableLevelToast({ levelChange, onDismiss }) {
  useEffect(() => {
    if (!levelChange) return
    const timer = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timer)
  }, [levelChange, onDismiss])

  if (!levelChange) return null

  const table = TABLE_LEVELS[levelChange.to]
  const isUpgrade = levelChange.to > levelChange.from

  return (
    <div
      className={`${styles.toast} ${isUpgrade ? styles.upgrade : styles.downgrade}`}
      onClick={onDismiss}
    >
      <span className={styles.emoji}>{isUpgrade ? '🎰' : '📉'}</span>
      <div className={styles.textGroup}>
        <span className={styles.label}>
          {isUpgrade ? 'TABLE UNLOCKED' : 'TABLE CHANGED'}
        </span>
        <span className={styles.name}>{table.name}</span>
        <span className={styles.description}>
          Min bet: ${table.minBet.toLocaleString()}
        </span>
      </div>
    </div>
  )
}

export default memo(TableLevelToast)
