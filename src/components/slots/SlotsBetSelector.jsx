import { memo, useCallback, useMemo } from 'react'
import { formatMoney } from '../../utils/formatters'
import styles from './SlotsBetSelector.module.css'

const PRESETS = [1, 10, 100, 500, 1000]

function SlotsBetSelector({ betAmount, bankroll, onSetBet, onSpin, onMaxBet }) {
  const maxBet = bankroll
  const canSpin = betAmount > 0 && betAmount <= bankroll && bankroll > 0

  // Log-scale slider: position 0→1 maps to $1→bankroll exponentially
  const sliderValue = useMemo(() => {
    if (maxBet <= 1) return 100
    const logMin = Math.log(1)
    const logMax = Math.log(maxBet)
    return Math.round(((Math.log(betAmount) - logMin) / (logMax - logMin)) * 100)
  }, [betAmount, maxBet])

  const handleSliderChange = useCallback((e) => {
    const pct = Number(e.target.value) / 100
    if (maxBet <= 1) {
      onSetBet(1)
      return
    }
    const logMin = Math.log(1)
    const logMax = Math.log(maxBet)
    const value = Math.round(Math.exp(logMin + pct * (logMax - logMin)))
    onSetBet(Math.max(1, Math.min(value, maxBet)))
  }, [maxBet, onSetBet])

  const handlePreset = useCallback((value) => {
    onSetBet(Math.min(value, bankroll))
  }, [bankroll, onSetBet])

  return (
    <div className={styles.selector}>
      <div className={styles.presetRow}>
        {PRESETS.map((value) => (
          <button
            key={value}
            className={`${styles.presetButton} ${betAmount === value ? styles.active : ''}`}
            onClick={() => handlePreset(value)}
            disabled={value > bankroll}
          >
            {formatMoney(value)}
          </button>
        ))}
        <button
          className={`${styles.presetButton} ${styles.maxButton} ${betAmount === bankroll ? styles.active : ''}`}
          onClick={onMaxBet}
          disabled={bankroll <= 0}
        >
          MAX
        </button>
      </div>

      <div className={styles.sliderRow}>
        <span className={styles.sliderLabel}>{formatMoney(1)}</span>
        <input
          type="range"
          min="0"
          max="100"
          value={sliderValue}
          onChange={handleSliderChange}
          className={styles.slider}
          disabled={bankroll <= 0}
        />
        <span className={styles.sliderLabel}>{formatMoney(maxBet)}</span>
      </div>

      <button
        className={`${styles.spinButton} ${!canSpin ? styles.disabled : ''}`}
        onClick={onSpin}
        disabled={!canSpin}
      >
        SPIN
      </button>
    </div>
  )
}

export default memo(SlotsBetSelector)
