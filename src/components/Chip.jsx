import { memo } from 'react'
import { m } from 'motion/react'
import styles from './Chip.module.css'

const Chip = memo(function Chip({ label, color, rimColor, spotColor, textColor, size = 'tray', selected = false, onClick, animate = false }) {
  const sizeClass = size === 'stack' ? styles.stack : styles.tray
  const chipClass = `${styles.chip} ${sizeClass}${selected ? ` ${styles.selected}` : ''}${animate ? ` ${styles.animate}` : ''}`

  return (
    <m.button
      className={chipClass}
      style={{
        '--chip-face': color,
        '--chip-rim': rimColor || color,
        '--chip-spot': spotColor || '#e8e4d8',
        '--chip-text': textColor,
        '--chip-glow': `${color}66`,
      }}
      onPointerDown={(e) => onClick?.(e)}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <span className={styles.label}>{label}</span>
    </m.button>
  )
})

export default Chip
