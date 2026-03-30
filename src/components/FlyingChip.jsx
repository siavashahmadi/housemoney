import React from 'react'
import { CHIP_MAP } from '../constants/chips'
import styles from './FlyingChip.module.css'

function FlyingChip({ value, from, to, onDone, reverse }) {
  const chip = CHIP_MAP[value] || CHIP_MAP[25]
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

export default React.memo(FlyingChip)
