import { memo } from 'react'
import Hand from './Hand'
import styles from './PlayerSpot.module.css'

const RESULT_LABELS = {
  blackjack: 'BJ!',
  win: 'WIN',
  dealerBust: 'WIN',
  bust: 'BUST',
  lose: 'LOSE',
  push: 'PUSH',
}

const RESULT_CLASSES = {
  blackjack: 'gold',
  win: 'green',
  dealerBust: 'green',
  bust: 'red',
  lose: 'red',
  push: 'dim',
}

const STATUS_LABELS = {
  betting: 'Betting...',
  ready: 'Ready',
  playing: 'Playing',
  standing: 'Standing',
  bust: 'Bust',
  done: 'Done',
  sitting_out: 'Sat Out',
}

const PlayerSpot = memo(function PlayerSpot({ player, isLocal, isActive, compact = false }) {
  const hands = player.hands || []
  const hasCards = hands.length > 0 && hands[0]?.cards?.length > 0
  const size = compact ? 'small' : 'normal'
  const isSplit = hands.length > 1

  return (
    <div className={`${styles.spot} ${isActive ? styles.active : ''} ${compact ? styles.compact : ''}`}>
      <div className={styles.nameRow}>
        {!player.connected && <span className={styles.disconnectedDot} />}
        <span className={styles.name}>
          {player.name}
          {isLocal && <span className={styles.youBadge}>YOU</span>}
        </span>
      </div>

      <div className={styles.handArea}>
        {hasCards ? (
          isSplit ? (
            <div className={styles.splitHands}>
              {hands.map((hand, i) => (
                <div
                  key={i}
                  className={`${styles.handWrapper} ${i === player.active_hand_index ? styles.activeHandWrapper : ''}`}
                >
                  <Hand cards={hand.cards} animate={true} size="small" />
                  {hand.hand_value > 0 && (
                    <span className={styles.handValue}>{hand.hand_value}</span>
                  )}
                  {hand.result && (
                    <span className={`${styles.handResult} ${styles[RESULT_CLASSES[hand.result]] || ''}`}>
                      {RESULT_LABELS[hand.result]}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Hand cards={hands[0].cards} animate={true} size={size} />
          )
        ) : (
          <div className={compact ? styles.emptySmall : styles.empty} />
        )}
      </div>

      <div className={styles.info}>
        {hasCards && !isSplit && hands[0].hand_value > 0 && (
          <span className={styles.value}>{hands[0].hand_value}</span>
        )}
        {player.bet > 0 && (
          <span className={styles.bet}>${player.bet.toLocaleString()}</span>
        )}
        {player.betted_assets?.length > 0 && (
          <span className={styles.assets}>
            {player.betted_assets.map(a => a.emoji || a.name).join(' ')}
          </span>
        )}
      </div>

      <div className={styles.bankrollRow}>
        <span className={`${styles.bankroll} ${player.bankroll < 0 ? styles.inDebt : ''}`}>
          {player.bankroll < 0 ? '-' : ''}${Math.abs(player.bankroll).toLocaleString()}
        </span>
      </div>

      {player.result && !isSplit && (
        <span className={`${styles.result} ${styles[RESULT_CLASSES[player.result]] || ''}`}>
          {RESULT_LABELS[player.result]}
        </span>
      )}

      {!player.result && player.status && player.status !== 'idle' && (
        <span className={styles.status}>{STATUS_LABELS[player.status] || player.status}</span>
      )}
    </div>
  )
})

export default PlayerSpot
