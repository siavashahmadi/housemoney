import React from 'react'
import styles from './ActionButtons.module.css'

function ActionButtons({ onHit, onStand, onDoubleDown, canDoubleDown, onSplit, canSplit }) {
  return (
    <div className={styles.actions}>
      <button className={`${styles.button} ${styles.hit}`} onClick={onHit}>
        HIT
      </button>
      <button className={`${styles.button} ${styles.stand}`} onClick={onStand}>
        STAND
      </button>
      {canSplit && (
        <button className={`${styles.button} ${styles.split}`} onClick={onSplit}>
          SPLIT
        </button>
      )}
      <button
        className={`${styles.button} ${styles.doubleDown}${!canDoubleDown ? ` ${styles.disabled}` : ''}`}
        onClick={canDoubleDown ? onDoubleDown : undefined}
      >
        DOUBLE
      </button>
    </div>
  )
}

export default React.memo(ActionButtons)
