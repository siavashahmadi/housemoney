import { ACHIEVEMENTS } from '../constants/achievements'
import styles from './AchievementPanel.module.css'

function AchievementPanel({ unlockedAchievements, onClose }) {
  const unlockedSet = new Set(unlockedAchievements)

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>ACHIEVEMENTS</h2>
          <span className={styles.count}>
            {unlockedSet.size} / {ACHIEVEMENTS.length}
          </span>
          <button className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className={styles.grid}>
          {ACHIEVEMENTS.map(achievement => {
            const unlocked = unlockedSet.has(achievement.id)
            return (
              <div
                key={achievement.id}
                className={`${styles.card} ${unlocked ? styles.unlocked : styles.locked}`}
              >
                <span className={styles.cardEmoji}>
                  {unlocked ? achievement.emoji : '?'}
                </span>
                <span className={styles.cardName}>
                  {unlocked ? achievement.name : '???'}
                </span>
                <span className={styles.cardDesc}>
                  {unlocked ? achievement.description : 'Keep playing...'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default AchievementPanel
