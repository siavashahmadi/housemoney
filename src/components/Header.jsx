import styles from './Header.module.css'

function Header({ onReset }) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <h1 className={styles.logo}>BLACKJACK</h1>
        <span className={styles.subtitle}>HIGH STAKES</span>
      </div>
      <button className={styles.resetButton} onClick={onReset}>
        NEW GAME
      </button>
    </header>
  )
}

export default Header
