import { memo, useState, useCallback } from 'react'
import styles from './ModeSelect.module.css'

function ModeSelect({ onSelectMode }) {
  const [selectedGame, setSelectedGame] = useState(null)

  const handleBack = useCallback(() => {
    setSelectedGame(null)
  }, [])

  if (selectedGame === null) {
    return (
      <div className={styles.container}>
        <div className={styles.brand}>
          <h1 className={styles.logo}>HOUSE MONEY</h1>
          <span className={styles.subtitle}>CHOOSE YOUR GAME</span>
        </div>

        <div className={styles.options}>
          <button className={styles.modeButton} onClick={() => setSelectedGame('blackjack')}>
            <span className={styles.modeIcon}>{'\u{1F0CF}'}</span>
            <span className={styles.modeTitle}>BLACKJACK</span>
            <span className={styles.modeDesc}>Classic card game</span>
          </button>

          <button className={styles.modeButton} onClick={() => setSelectedGame('slots')}>
            <span className={styles.modeIcon}>{'\u{1F3B0}'}</span>
            <span className={styles.modeTitle}>SLOTS</span>
            <span className={styles.modeDesc}>Spin to win</span>
          </button>
        </div>
      </div>
    )
  }

  const isBlackjack = selectedGame === 'blackjack'
  const logoText = isBlackjack ? 'BLACKJACK' : 'SLOTS'

  return (
    <div className={styles.container}>
      <div className={styles.brand}>
        <h1 className={styles.logo}>{logoText}</h1>
        <span className={styles.subtitle}>CHOOSE YOUR TABLE</span>
      </div>

      <div className={styles.options}>
        <button
          className={styles.modeButton}
          onClick={() => onSelectMode(`solo-${selectedGame}`)}
        >
          <span className={styles.modeIcon}>{'\u{1F0CF}'}</span>
          <span className={styles.modeTitle}>SOLO</span>
          <span className={styles.modeDesc}>Classic single-player</span>
        </button>

        <button
          className={styles.modeButton}
          onClick={() => onSelectMode(`multiplayer-${selectedGame}`)}
        >
          <span className={styles.modeIcon}>{'\u{1F465}'}</span>
          <span className={styles.modeTitle}>{isBlackjack ? 'MULTIPLAYER' : 'BATTLE'}</span>
          <span className={styles.modeDesc}>
            {isBlackjack ? 'Play with friends' : 'Compete with friends'}
          </span>
        </button>
      </div>

      <button className={styles.backButton} onClick={handleBack}>
        BACK
      </button>
    </div>
  )
}

export default memo(ModeSelect)
