import styles from './Header.module.css'

function getSubtitle(bankroll) {
  if (bankroll < -1000000) return 'ECONOMIC DISASTER'
  if (bankroll < -100000) return 'ROCK BOTTOM SPEEDRUN'
  if (bankroll < -10000) return 'FINANCIAL RUIN SIMULATOR'
  if (bankroll < 0) return 'DEBT ACCUMULATOR'
  if (bankroll < 1000) return 'LAST STAND'
  if (bankroll <= 10000) return 'HIGH STAKES'
  return 'HIGH ROLLER'
}

function Header({ bankroll, onReset, unlockedCount, onToggleAchievements }) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <h1 className={styles.logo}>BLACKJACK</h1>
        <span className={styles.subtitle}>{getSubtitle(bankroll)}</span>
      </div>
      <div className={styles.actions}>
        <button className={styles.achievementButton} onClick={onToggleAchievements}>
          <span>🏆</span>
          {unlockedCount > 0 && (
            <span className={styles.badge}>{unlockedCount}</span>
          )}
        </button>
        <button className={styles.resetButton} onClick={onReset}>
          NEW GAME
        </button>
      </div>
    </header>
  )
}

export default Header
