import styles from './ResultBanner.module.css'

const RESULT_CONFIG = {
  blackjack: { text: 'BLACKJACK!', colorClass: 'gold' },
  win: { text: 'YOU WIN!', colorClass: 'green' },
  dealerBust: { text: 'DEALER BUSTS!', colorClass: 'green' },
  bust: { text: 'BUST!', colorClass: 'red' },
  lose: { text: 'YOU LOSE', colorClass: 'red' },
  push: { text: 'PUSH', colorClass: 'dim' },
}

function ResultBanner({ result, onNextHand }) {
  const config = RESULT_CONFIG[result]
  if (!config) return null

  return (
    <div className={styles.banner}>
      <span className={`${styles.resultText} ${styles[config.colorClass]}`}>
        {config.text}
      </span>
      <button className={styles.nextButton} onClick={onNextHand}>
        NEXT HAND
      </button>
    </div>
  )
}

export default ResultBanner
