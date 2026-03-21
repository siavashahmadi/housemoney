import { memo } from 'react'
import styles from './Chip.module.css'

const Chip = memo(function Chip({ label, color, textColor, size = 'tray', selected = false, onClick, animate = false }) {
  const sizeClass = size === 'stack' ? styles.stack : styles.tray
  const chipClass = `${styles.chip} ${sizeClass}${selected ? ` ${styles.selected}` : ''}${animate ? ` ${styles.animate}` : ''}`

  return (
    <button
      className={chipClass}
      style={{
        '--chip-bg': color,
        '--chip-text': textColor,
        '--chip-border': `${color}88`,
        '--chip-glow': `${color}66`,
      }}
      onPointerDown={onClick}
    >
      {label}
    </button>
  )
})

export default Chip
