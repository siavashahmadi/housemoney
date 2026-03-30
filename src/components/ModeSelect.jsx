import { memo } from 'react'
import styles from './ModeSelect.module.css'

function ModeSelect({ onSelectSolo, onSelectMultiplayer }) {
  return (
    <div className={styles.container}>
      <div className={styles.brand}>
        <h1 className={styles.logo}>BLACKJACK</h1>
        <span className={styles.subtitle}>CHOOSE YOUR TABLE</span>
      </div>

      <div className={styles.options}>
        <button className={styles.modeButton} onClick={onSelectSolo}>
          <span className={styles.modeIcon}>🃏</span>
          <span className={styles.modeTitle}>SOLO</span>
          <span className={styles.modeDesc}>Classic single-player</span>
        </button>

        <button className={styles.modeButton} onClick={onSelectMultiplayer}>
          <span className={styles.modeIcon}>👥</span>
          <span className={styles.modeTitle}>MULTIPLAYER</span>
          <span className={styles.modeDesc}>Play with friends</span>
        </button>
      </div>
    </div>
  )
}

export default memo(ModeSelect)
