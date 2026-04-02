import { memo } from 'react'
import styles from './DealerChip.module.css'

const DealerChip = memo(function DealerChip({ dealer }) {
  if (!dealer) return null

  const chipLabel = dealer.id === 'voss' ? 'VOSS'
    : dealer.id === 'inferno' ? 'MR.I'
    : dealer.name.toUpperCase()

  return (
    <div
      className={styles.chip}
      style={{
        '--dealer-chip-face': dealer.chipColor,
        '--dealer-chip-rim': dealer.chipRimColor || dealer.chipColor,
        '--dealer-chip-spot': '#e8e4d8',
        '--dealer-chip-text': dealer.chipTextColor || '#fff',
      }}
      aria-label={`Dealer: ${dealer.name}`}
    >
      <span className={styles.name}>{chipLabel}</span>
    </div>
  )
})

export default DealerChip
