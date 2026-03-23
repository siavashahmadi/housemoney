import { useMemo, useState, useEffect, useRef, forwardRef } from 'react'
import { CHIPS } from '../constants/chips'
import { MAX_VISUAL_CHIPS } from '../constants/gameConfig'
import { formatMoney } from '../utils/formatters'
import Chip from './Chip'
import styles from './BettingCircle.module.css'

const CHIP_MAP = Object.fromEntries(CHIPS.map(c => [c.value, c]))
const RESULT_ANIMATE_MS = 800

const BettingCircle = forwardRef(function BettingCircle(
  { chipStack = [], bettedAssets = [], result, onUndo, onRemoveAsset },
  ref
) {
  // Local state to delay visual clearing of chips after hand resolution
  const [displayChips, setDisplayChips] = useState(chipStack)
  const [displayAssets, setDisplayAssets] = useState(bettedAssets)
  const [animatingOut, setAnimatingOut] = useState(false)
  const prevChipLenRef = useRef(chipStack.length)

  useEffect(() => {
    const prevLen = prevChipLenRef.current
    prevChipLenRef.current = chipStack.length

    if (prevLen > 0 && chipStack.length === 0 && result) {
      // Chips just cleared (RESOLVE_HAND) — keep displaying for animation
      setAnimatingOut(true)
      const timer = setTimeout(() => {
        setDisplayChips([])
        setDisplayAssets([])
        setAnimatingOut(false)
      }, RESULT_ANIMATE_MS)
      return () => clearTimeout(timer)
    } else {
      // Normal update — sync immediately
      setDisplayChips(chipStack)
      setDisplayAssets(bettedAssets)
      setAnimatingOut(false)
    }
  }, [chipStack, bettedAssets])

  const isWin = result === 'win' || result === 'blackjack' || result === 'dealerBust'

  const { total, isEmpty, visibleChips, overflowCount } = useMemo(() => {
    const ct = displayChips.reduce((sum, v) => sum + v, 0)
    const at = displayAssets.reduce((sum, a) => sum + a.value, 0)
    return {
      total: ct + at,
      isEmpty: displayChips.length === 0 && displayAssets.length === 0,
      visibleChips: displayChips.slice(-MAX_VISUAL_CHIPS),
      overflowCount: displayChips.length > MAX_VISUAL_CHIPS ? displayChips.length : 0,
    }
  }, [displayChips, displayAssets])

  const animClass = animatingOut
    ? (isWin ? styles.spreadOut : styles.sweepOut)
    : ''

  return (
    <div className={styles.wrapper} ref={ref}>
      <button
        className={`${styles.circle}${isEmpty ? ` ${styles.empty}` : ''}`}
        onClick={isEmpty ? undefined : onUndo}
      >
        {visibleChips.length > 0 && (
          <div className={`${styles.chipStack} ${animClass}`}>
            {visibleChips.map((value, i) => {
              const chip = CHIP_MAP[value] || CHIPS[0]
              const isLast = i === visibleChips.length - 1 && displayAssets.length === 0
              return (
                <div
                  key={`${i}-${value}`}
                  className={styles.stackedChip}
                  style={{
                    transform: `translate(-50%, -50%) translate(${i}px, ${-i * 3}px)`,
                    zIndex: i,
                  }}
                >
                  <Chip
                    label={chip.label}
                    color={chip.color}
                    textColor={chip.textColor}
                    size="stack"
                    animate={false}
                  />
                </div>
              )
            })}
          </div>
        )}
        {displayAssets.length > 0 && (
          <div className={`${styles.assetChips} ${animClass}`}>
            {displayAssets.map((asset, i) => {
              const baseOffset = visibleChips.length
              return (
                <div
                  key={asset.id}
                  className={styles.assetChip}
                  style={{
                    transform: `translate(-50%, -50%) translate(${baseOffset + i}px, ${-(baseOffset + i) * 3}px)`,
                    zIndex: baseOffset + i + 1,
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!animatingOut) onRemoveAsset(asset.id)
                  }}
                >
                  <span className={styles.assetEmoji}>{asset.emoji}</span>
                </div>
              )
            })}
          </div>
        )}
        {overflowCount > 0 && !animatingOut && (
          <span className={styles.badge}>&times;{overflowCount}</span>
        )}
        {isEmpty && !animatingOut && <span className={styles.placeholder}>BET</span>}
        {total > 0 && !animatingOut && (
          <span className={styles.total}>{formatMoney(total)}</span>
        )}
      </button>
    </div>
  )
})

export default BettingCircle
