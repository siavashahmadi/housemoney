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
  mixed: 'MIXED',
}

const RESULT_CLASSES = {
  blackjack: 'gold',
  win: 'green',
  dealerBust: 'green',
  bust: 'red',
  lose: 'red',
  push: 'dim',
  mixed: 'mixed',
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

function arePlayerSpotPropsEqual(prev, next) {
  if (prev.isLocal !== next.isLocal) return false
  if (prev.isActive !== next.isActive) return false
  if (prev.compact !== next.compact) return false
  const pp = prev.player
  const np = next.player
  if (pp.status !== np.status) return false
  if (pp.bankroll !== np.bankroll) return false
  if (pp.name !== np.name) return false
  if (pp.result !== np.result) return false
  if (pp.bet !== np.bet) return false
  if (pp.connected !== np.connected) return false
  if (pp.active_hand_index !== np.active_hand_index) return false
  if (pp.hands !== np.hands) return false
  if (pp.betted_assets !== np.betted_assets) return false
  return true
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
        {(() => {
          // During playing/result, player.bet is 0 (bet migrates to hand dicts on deal).
          // Show sum of hand bets when cards are dealt, otherwise the pre-deal bet.
          const totalBet = hasCards
            ? hands.reduce((sum, h) => sum + (h.bet || 0), 0)
            : player.bet
          return totalBet > 0 ? (
            <span className={styles.bet}>${totalBet.toLocaleString()}</span>
          ) : null
        })()}
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
}, arePlayerSpotPropsEqual)

export default PlayerSpot
