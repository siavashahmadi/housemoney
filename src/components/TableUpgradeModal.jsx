import { memo, useState } from 'react'
import { TABLE_LEVELS } from '../constants/tableLevels'
import { PIT_BOSS_LINES } from '../constants/pitBossLines'
import { formatMoney } from '../utils/formatters'
import styles from './TableUpgradeModal.module.css'

function TableUpgradeModal({ pendingUpgrade, onAccept, onDecline }) {
  const targetTable = pendingUpgrade ? TABLE_LEVELS[pendingUpgrade.to] : null
  const [line] = useState(() => {
    if (!targetTable) return ''
    const lines = PIT_BOSS_LINES[targetTable.id] || []
    return lines[Math.floor(Math.random() * lines.length)] || ''
  })

  if (!pendingUpgrade) return null

  return (
    <div className={styles.overlay} onClick={onDecline}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <span className={styles.emoji}>&#x1F574;&#xFE0F;</span>
        <span className={styles.title}>{targetTable.name}</span>
        <span className={styles.stakes}>
          {formatMoney(targetTable.minBet)} &ndash; {formatMoney(targetTable.maxBet)}
        </span>
        <p className={styles.pitch}>{line}</p>
        <div className={styles.buttons}>
          <button className={styles.accept} onClick={onAccept}>
            TAKE ME THERE
          </button>
          <button className={styles.decline} onClick={onDecline}>
            I&apos;M GOOD HERE
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(TableUpgradeModal)
