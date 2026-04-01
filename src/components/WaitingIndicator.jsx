import { memo } from 'react'
import styles from './WaitingIndicator.module.css'

function WaitingIndicator({ playerName }) {
  return (
    <div className={styles.waiting}>
      <span className={styles.text}>
        Waiting for {playerName || 'other player'}
      </span>
      <span className={styles.dots}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </span>
    </div>
  )
}

export default memo(WaitingIndicator)
