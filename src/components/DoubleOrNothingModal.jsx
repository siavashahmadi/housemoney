import React, { useState, useCallback } from 'react'
import { formatMoney } from '../utils/formatters'
import styles from './DoubleOrNothingModal.module.css'
import audioManager from '../utils/audioManager'

const ESCALATING_TEXT = [
  'DOUBLE OR NOTHING?',
  'QUADRUPLE OR NOTHING?',
  'OCTUPLE OR NOTHING?',
  'THIS IS GETTING CONCERNING',
  'THE CASINO IS BEGGING YOU TO STOP',
  'MATHEMATICALLY INADVISABLE',
  'YOUR ANCESTORS ARE WEEPING',
  "JUST... WHY?",
]

function getButtonText(flipCount) {
  return ESCALATING_TEXT[Math.min(flipCount, ESCALATING_TEXT.length - 1)]
}

function DoubleOrNothingModal({ doubleOrNothing, onAccept, onDecline }) {
  const [flipping, setFlipping] = useState(false)
  const [flipResult, setFlipResult] = useState(null)

  const handleFlip = useCallback(() => {
    setFlipping(true)
    setFlipResult(null)
    audioManager.play('coin_flip')

    const won = Math.random() < 0.5

    setTimeout(() => {
      setFlipResult(won ? 'win' : 'lose')
      setFlipping(false)
      audioManager.play(won ? 'don_win' : 'don_lose')

      setTimeout(() => {
        setFlipResult(null)
        onAccept(won)
      }, 800)
    }, 1000)
  }, [onAccept])

  const { currentStakes, flipCount } = doubleOrNothing

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={`${styles.coin} ${flipping ? styles.spinning : ''} ${flipResult ? styles[flipResult] : ''}`}>
          <div className={styles.coinFace}>
            {flipResult === 'win' ? '✓' : flipResult === 'lose' ? '✗' : '$'}
          </div>
        </div>

        <div className={styles.stakes}>
          {formatMoney(currentStakes)}
        </div>

        {flipResult && (
          <div className={`${styles.resultText} ${styles[flipResult]}`}>
            {flipResult === 'win' ? 'YOU WIN IT BACK!' : 'DOUBLE DOWN...'}
          </div>
        )}

        {!flipping && !flipResult && (
          <div className={styles.buttons}>
            <button className={styles.flipButton} onClick={handleFlip}>
              {getButtonText(flipCount)}
            </button>
            <button className={styles.walkButton} onClick={onDecline}>
              WALK AWAY
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default React.memo(DoubleOrNothingModal)
