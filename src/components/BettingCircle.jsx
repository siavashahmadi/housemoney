import React, { useMemo, useState, useEffect, useRef, forwardRef } from 'react'
import { CHIP_MAP } from '../constants/chips'
import { isWinResult } from '../utils/cardUtils'
import { sumChipStack } from '../utils/chipUtils'
import { MAX_VISUAL_CHIPS } from '../constants/gameConfig'
import { formatMoney } from '../utils/formatters'
import Chip from './Chip'
import styles from './BettingCircle.module.css'

const RESULT_ANIMATE_MS = 800

const BettingCircle = React.memo(forwardRef(function BettingCircle(
  { chipStack = [], bettedAssets = [], result, onUndo, onRemoveAsset, playerHands = [] },
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

  const isWin = isWinResult(result)

  const { total, isEmpty, visibleChips, overflowCount } = useMemo(() => {
    const ct = sumChipStack(displayChips)
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
      <div
        className={`${styles.circle}${isEmpty ? ` ${styles.empty}` : ''}`}
        role="button"
        tabIndex={isEmpty ? -1 : 0}
        onClick={isEmpty ? undefined : onUndo}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !isEmpty) onUndo() }}
      >
        {visibleChips.length > 0 && (
          <div className={`${styles.chipStack} ${animClass}`}>
            {visibleChips.map((value, i) => {
              const chip = CHIP_MAP[value] || CHIP_MAP[25]
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
                    rimColor={chip.rimColor}
                    spotColor={chip.spotColor}
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
        {total > 0 && !animatingOut && playerHands.length <= 1 && (
          <span className={styles.total}>{formatMoney(total)}</span>
        )}
        {playerHands.length > 1 && !animatingOut && (
          <>
            <span className={styles.total}>
              {formatMoney(playerHands.reduce((sum, h) => sum + h.bet, 0))}
            </span>
            <span className={styles.handCount}>{playerHands.length} HANDS</span>
          </>
        )}
      </div>
    </div>
  )
}))

export default BettingCircle
