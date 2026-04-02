import { useMemo } from 'react'
import styles from './LoanSharkFigures.module.css'

function getDebtStage(bankroll) {
  if (bankroll > -10_000) return 0
  if (bankroll > -25_000) return 1
  if (bankroll > -50_000) return 2
  if (bankroll > -100_000) return 3
  if (bankroll > -250_000) return 4
  if (bankroll > -500_000) return 5
  if (bankroll > -1_000_000) return 6
  if (bankroll > -5_000_000) return 7
  return 8
}

function LoanSharkFigures({ bankroll }) {
  const stage = useMemo(() => getDebtStage(bankroll), [bankroll])

  if (stage === 0) return null

  return (
    <div className={styles.container} data-stage={stage} aria-hidden="true">
      {/* Stage 1+: Single figure at table edge */}
      <div className={`${styles.figure} ${styles.figureRight}`} />

      {/* Stage 3+: Second figure flanking */}
      {stage >= 3 && <div className={`${styles.figure} ${styles.figureLeft}`} />}

      {/* Stage 4+: Figure behind dealer */}
      {stage >= 4 && <div className={`${styles.figure} ${styles.figureCenter}`} />}

      {/* Stage 5+: One holding something */}
      {stage >= 5 && <div className={`${styles.figure} ${styles.figureRightBack} ${styles.armed}`} />}

      {/* Stage 6+: Boss figure */}
      {stage >= 6 && <div className={`${styles.figure} ${styles.figureBoss}`} />}

      {/* Stage 7+: Figures at edges */}
      {stage >= 7 && (
        <>
          <div className={`${styles.figure} ${styles.figureTopLeft}`} />
          <div className={`${styles.figure} ${styles.figureTopRight}`} />
        </>
      )}

      {/* Stage 8: Felt tint overlay */}
      {stage >= 8 && <div className={styles.feltTint} />}
    </div>
  )
}

export default LoanSharkFigures
