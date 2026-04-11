import React from 'react'
import { m } from 'motion/react'
import styles from './ActionButtons.module.css'

function ActionButtons({ onHit, onStand, onDoubleDown, canDoubleDown, onSplit, canSplit }) {
  return (
    <div className={styles.actions}>
      <m.button className={`${styles.button} ${styles.hit}`} onClick={onHit} whileTap={{ y: 2, scale: 0.97 }} transition={{ duration: 0.06 }}>
        HIT
      </m.button>
      <m.button className={`${styles.button} ${styles.stand}`} onClick={onStand} whileTap={{ y: 2, scale: 0.97 }} transition={{ duration: 0.06 }}>
        STAND
      </m.button>
      {canSplit && (
        <m.button className={`${styles.button} ${styles.split}`} onClick={onSplit} whileTap={{ y: 2, scale: 0.97 }} transition={{ duration: 0.06 }}>
          SPLIT
        </m.button>
      )}
      <m.button
        className={`${styles.button} ${styles.doubleDown}${!canDoubleDown ? ` ${styles.disabled}` : ''}`}
        onClick={canDoubleDown ? onDoubleDown : undefined}
        whileTap={canDoubleDown ? { y: 2, scale: 0.97 } : undefined}
        transition={{ duration: 0.06 }}
      >
        DOUBLE
      </m.button>
    </div>
  )
}

export default React.memo(ActionButtons)
