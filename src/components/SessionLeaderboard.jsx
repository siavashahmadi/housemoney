import { useEffect } from 'react'
import { formatMoney } from '../utils/formatters'
import styles from './SessionLeaderboard.module.css'

function SessionLeaderboard({ stats, onDismiss }) {
  const { leaderboard = [], awards = [] } = stats || {}

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onDismiss])

  return (
    <div className={styles.overlay} onClick={onDismiss}>
      <div className={styles.panel} role="dialog" aria-label="Session statistics" onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>SESSION STATS</h2>

        {awards.length > 0 && (
          <div className={styles.awards}>
            {awards.map(award => (
              <div key={award.title} className={styles.awardCard}>
                <span className={styles.awardEmoji}>{award.emoji}</span>
                <span className={styles.awardTitle}>{award.title}</span>
                <span className={styles.awardWinner}>{award.winner}</span>
                <span className={styles.awardValue}>{award.value}</span>
              </div>
            ))}
          </div>
        )}

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thRank}>#</th>
                <th className={styles.thName}>Player</th>
                <th className={styles.thNum}>Bankroll</th>
                <th className={styles.thNum}>Net</th>
                <th className={styles.thNum}>Hands</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((player, idx) => (
                <tr key={player.player_id}>
                  <td className={styles.rank}>{idx + 1}</td>
                  <td className={styles.name}>{player.name}</td>
                  <td className={styles.num}>{formatMoney(player.bankroll)}</td>
                  <td className={`${styles.num} ${player.net_change >= 0 ? styles.positive : styles.negative}`}>
                    {player.net_change >= 0 ? '+' : ''}{formatMoney(player.net_change)}
                  </td>
                  <td className={styles.num}>{player.hands_played}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button className={styles.backButton} onClick={onDismiss}>
          BACK TO TABLE
        </button>
      </div>
    </div>
  )
}

export default SessionLeaderboard
