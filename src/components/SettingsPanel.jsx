import { memo } from 'react'
import styles from './SettingsPanel.module.css'

const SETTINGS = [
  {
    key: 'sound',
    label: 'Sound',
    description: 'Sound effects',
    getValue: (props) => !props.muted,
    onToggle: 'onToggleMute',
  },
  {
    key: 'notifications',
    label: 'Notifications',
    description: 'Loan shark, table level, and comp toasts',
    getValue: (props) => props.notificationsEnabled,
    onToggle: 'onToggleNotifications',
  },
  {
    key: 'achievements',
    label: 'Achievements',
    description: 'Achievement unlock toasts',
    getValue: (props) => props.achievementsEnabled,
    onToggle: 'onToggleAchievementsEnabled',
  },
  {
    key: 'ddFaceDown',
    label: 'Face-Down Double',
    description: 'Deal the double down card face-down until reveal',
    getValue: (props) => props.ddCardFaceDown,
    onToggle: 'onToggleDdFaceDown',
  },
]

function SettingsPanel(props) {
  const { onClose } = props

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>SETTINGS</h2>
          <button className={styles.closeButton} onClick={onClose}>&#x2715;</button>
        </div>
        <div className={styles.settings}>
          {SETTINGS.map((setting) => {
            const isOn = setting.getValue(props)
            return (
              <div key={setting.key} className={styles.settingRow}>
                <div className={styles.settingInfo}>
                  <span className={styles.settingLabel}>{setting.label}</span>
                  <span className={styles.settingDescription}>{setting.description}</span>
                </div>
                <button
                  className={`${styles.toggleButton} ${isOn ? styles.toggleOn : styles.toggleOff}`}
                  onClick={props[setting.onToggle]}
                >
                  {isOn ? 'ON' : 'OFF'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default memo(SettingsPanel)
