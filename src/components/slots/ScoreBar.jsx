import styles from './ScoreBar.module.css'

function ScoreBar({ players, currentPlayerId }) {
  const maxScore = Math.max(1, ...players.map(p => p.totalScore))

  return (
    <div className={styles.container}>
      {players.map((p, i) => {
        const isLeader = i === 0 && p.totalScore > 0
        const isSelf = p.playerId === currentPlayerId
        const widthPct = maxScore > 0 ? (p.totalScore / maxScore) * 100 : 0

        return (
          <div key={p.playerId} className={styles.row}>
            <span className={`${styles.name} ${isSelf ? styles.nameSelf : ''}`}>
              {p.name}
            </span>
            <div className={styles.barTrack}>
              <div
                className={`${styles.barFill} ${isLeader ? styles.barLeader : styles.barDefault}`}
                style={{ width: `${widthPct}%` }}
              />
            </div>
            <span className={`${styles.score} ${isLeader ? styles.scoreLeader : ''}`}>
              {p.totalScore}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default ScoreBar
