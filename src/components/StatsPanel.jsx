import { memo, useMemo, useCallback } from 'react'
import { formatMoney } from '../utils/formatters'
import { getVigRate } from '../constants/vigRates'
import { shareStats } from '../utils/shareCard'
import styles from './StatsPanel.module.css'

function getFinancialGrade(bankroll) {
  if (bankroll >= 1_000_000) return { grade: 'A+', label: 'Wall Street Material' }
  if (bankroll >= 100_000) return { grade: 'A', label: 'Doing Well' }
  if (bankroll >= 50_000) return { grade: 'B+', label: 'Not Bad' }
  if (bankroll >= 10_000) return { grade: 'B', label: 'Holding Steady' }
  if (bankroll >= 0) return { grade: 'C', label: 'Breaking Even-ish' }
  if (bankroll >= -10_000) return { grade: 'D', label: 'Concerning' }
  if (bankroll >= -50_000) return { grade: 'F', label: 'Failing' }
  if (bankroll >= -250_000) return { grade: 'F-', label: 'Catastrophic' }
  if (bankroll >= -1_000_000) return { grade: 'F---', label: 'Beyond Help' }
  if (bankroll >= -5_000_000) return { grade: 'Z', label: 'Transcendently Bad' }
  return { grade: '\u2620', label: 'Deceased (Financially)' }
}

function getSubtitle(lowestBankroll) {
  if (lowestBankroll <= -1_000_000) return 'Economists are studying this'
  if (lowestBankroll <= -500_000) return 'This chart has been forwarded to the SEC'
  if (lowestBankroll <= -100_000) return 'Your credit score just filed a restraining order'
  if (lowestBankroll <= -50_000) return 'Financial advisors hate this one trick'
  if (lowestBankroll <= -10_000) return 'A cautionary tale'
  if (lowestBankroll <= 0) return 'The house always wins. Always.'
  return 'An inspiring story of perseverance'
}

function StatsPanel({ state, onClose }) {
  const { grade, label } = useMemo(() => getFinancialGrade(state.bankroll), [state.bankroll])
  const subtitle = useMemo(() => getSubtitle(state.lowestBankroll), [state.lowestBankroll])
  const handleShare = useCallback(() => shareStats(state), [state])

  const winRate = state.handsPlayed > 0
    ? ((state.handsWon / state.handsPlayed) * 100).toFixed(1) + '%'
    : '\u2014'

  const assetsRemaining = useMemo(() =>
    Object.values(state.ownedAssets).filter(Boolean).length,
    [state.ownedAssets]
  )

  const netPnL = state.totalWon - state.totalLost
  const currentVigRate = getVigRate(state.bankroll)
  const vigPercent = Math.round(currentVigRate * 100) + '%'

  const gradeColorClass = state.bankroll >= 0 ? styles.positive : styles.negative

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>YOUR STATS</h2>
          <button className={styles.closeButton} onClick={onClose}>&#x2715;</button>
        </div>

        <div className={styles.gradeCard}>
          <span className={`${styles.gradeValue} ${gradeColorClass}`}>{grade}</span>
          <span className={styles.gradeLabel}>{label}</span>
        </div>

        <p className={styles.subtitle}>{subtitle}</p>

        <div className={styles.statsGrid}>
          <div className={styles.statCell}>
            <span className={styles.statLabel}>Hands Played</span>
            <span className={styles.statValue}>{state.handsPlayed}</span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statLabel}>Win Rate</span>
            <span className={styles.statValue}>{winRate}</span>
          </div>

          <div className={styles.statCell}>
            <span className={styles.statLabel}>Blackjacks</span>
            <span className={styles.statValue}>{state.blackjackCount}</span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statLabel}>Total Wagered</span>
            <span className={styles.statValue}>{formatMoney(state.totalWagered)}</span>
          </div>

          <div className={styles.statCell}>
            <span className={styles.statLabel}>Best Win Streak</span>
            <span className={`${styles.statValue} ${styles.positive}`}>{state.bestWinStreak}</span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statLabel}>Best Lose Streak</span>
            <span className={`${styles.statValue} ${styles.negative}`}>{state.bestLoseStreak}</span>
          </div>

          <div className={styles.statCell}>
            <span className={styles.statLabel}>Biggest Win</span>
            <span className={`${styles.statValue} ${state.biggestWin > 0 ? styles.positive : ''}`}>
              {formatMoney(state.biggestWin)}
            </span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statLabel}>Biggest Loss</span>
            <span className={`${styles.statValue} ${state.biggestLoss > 0 ? styles.negative : ''}`}>
              {formatMoney(state.biggestLoss)}
            </span>
          </div>

          <div className={styles.statCell}>
            <span className={styles.statLabel}>Total Won</span>
            <span className={`${styles.statValue} ${state.totalWon > 0 ? styles.positive : ''}`}>
              {formatMoney(state.totalWon)}
            </span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statLabel}>Total Lost</span>
            <span className={`${styles.statValue} ${state.totalLost > 0 ? styles.negative : ''}`}>
              {formatMoney(state.totalLost)}
            </span>
          </div>

          <div className={styles.statCell}>
            <span className={styles.statLabel}>Net P&amp;L</span>
            <span className={`${styles.statValue} ${netPnL > 0 ? styles.positive : netPnL < 0 ? styles.negative : ''}`}>
              {formatMoney(netPnL)}
            </span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statLabel}>Assets Remaining</span>
            <span className={styles.statValue}>{assetsRemaining} / 6</span>
          </div>

          <div className={styles.statCell}>
            <span className={styles.statLabel}>Peak Bankroll</span>
            <span className={`${styles.statValue} ${styles.positive}`}>
              {formatMoney(state.peakBankroll)}
            </span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statLabel}>Rock Bottom</span>
            <span className={`${styles.statValue} ${state.lowestBankroll < 0 ? styles.negative : ''}`}>
              {formatMoney(state.lowestBankroll)}
            </span>
          </div>

          <div className={styles.statCell}>
            <span className={styles.statLabel}>Doubles W/L</span>
            <span className={styles.statValue}>{state.doublesWon} / {state.doublesLost}</span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statLabel}>Splits W/L</span>
            <span className={styles.statValue}>{state.splitsWon} / {state.splitsLost}</span>
          </div>

          <div className={styles.statCell}>
            <span className={styles.statLabel}>Total Vig Paid</span>
            <span className={`${styles.statValue} ${state.totalVigPaid > 0 ? styles.negative : ''}`}>
              {formatMoney(state.totalVigPaid)}
            </span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statLabel}>Current Vig Rate</span>
            <span className={styles.statValue}>{vigPercent}</span>
          </div>
        </div>

        <div className={styles.closeFooter}>
          <button className={styles.shareButton} onClick={handleShare}>
            SHARE YOUR SHAME
          </button>
          <button className={styles.closeFooterButton} onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(StatsPanel)
