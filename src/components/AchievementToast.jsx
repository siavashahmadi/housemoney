import { memo, useEffect } from 'react'
import { ACHIEVEMENT_MAP } from '../constants/achievements'
import styles from './AchievementToast.module.css'

function AchievementToast({ achievementId, onDismiss }) {
  useEffect(() => {
    if (!achievementId) return
    const timer = setTimeout(onDismiss, 3000)
    return () => clearTimeout(timer)
  }, [achievementId, onDismiss])

  const achievement = ACHIEVEMENT_MAP[achievementId]
  if (!achievement) return null

  return (
    <div className={styles.toast} onClick={onDismiss}>
      <span className={styles.emoji}>{achievement.emoji}</span>
      <div className={styles.textGroup}>
        <span className={styles.label}>ACHIEVEMENT UNLOCKED</span>
        <span className={styles.name}>{achievement.name}</span>
        <span className={styles.description}>{achievement.description}</span>
      </div>
    </div>
  )
}

export default memo(AchievementToast)
