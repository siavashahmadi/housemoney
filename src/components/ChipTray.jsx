import { memo, useMemo } from 'react'
import { getTableChips } from '../constants/tableLevels'
import Chip from './Chip'
import styles from './ChipTray.module.css'

function ChipTray({ bankroll, selectedChipValue, onChipTap, disabled, tableLevel = 0 }) {
  const availableChips = useMemo(() => getTableChips(tableLevel, bankroll), [tableLevel, bankroll])

  const isBorrowed = bankroll <= 0

  return (
    <div className={`${styles.tray} ${isBorrowed ? styles.borrowed : ''} ${disabled ? styles.disabled : ''}`}>
      {availableChips.map(chip => (
        <Chip
          key={chip.value}
          label={chip.label}
          color={chip.color}
          rimColor={chip.rimColor}
          spotColor={chip.spotColor}
          textColor={chip.textColor}
          size="tray"
          selected={selectedChipValue === chip.value}
          onClick={(e) => onChipTap(chip.value, e)}
        />
      ))}
      {isBorrowed && !disabled && <span className={styles.borrowedLabel}>BORROWED</span>}
    </div>
  )
}

export default memo(ChipTray)
