import { CHIPS } from '../constants/chips'
import Chip from './Chip'
import styles from './ChipTray.module.css'

function ChipTray({ bankroll, selectedChipValue, onChipTap }) {
  const availableChips = CHIPS.filter(
    chip => chip.unlockThreshold === null || bankroll <= chip.unlockThreshold
  )

  return (
    <div className={styles.tray}>
      {availableChips.map(chip => (
        <Chip
          key={chip.value}
          label={chip.label}
          color={chip.color}
          textColor={chip.textColor}
          size="tray"
          selected={selectedChipValue === chip.value}
          onClick={() => onChipTap(chip.value)}
        />
      ))}
    </div>
  )
}

export default ChipTray
