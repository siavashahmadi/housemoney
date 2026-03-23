import { CHIPS } from '../constants/chips'
import styles from './FlyingChip.module.css'

const CHIP_MAP = Object.fromEntries(CHIPS.map(c => [c.value, c]))

function FlyingChip({ value, from, to, onDone, reverse }) {
  const chip = CHIP_MAP[value] || CHIPS[0]
  const dx = to.x - from.x
  const dy = to.y - from.y

  return (
    <div
      className={`${styles.chip} ${reverse ? styles.reverse : ''}`}
      style={{
        '--chip-bg': chip.color,
        '--chip-text': chip.textColor,
        '--chip-border': `${chip.color}88`,
        '--fly-start-x': `${from.x}px`,
        '--fly-start-y': `${from.y}px`,
        '--fly-dx': `${dx}px`,
        '--fly-dy': `${dy}px`,
      }}
      onAnimationEnd={onDone}
    >
      {chip.label}
    </div>
  )
}

export default FlyingChip
