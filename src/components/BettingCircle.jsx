import React, { useMemo, useState, useEffect, useRef, forwardRef } from 'react'
import { m, useAnimate } from 'motion/react'
import { stagger } from 'motion'
import { CHIP_MAP } from '../constants/chips'
import { isWinResult } from '../utils/cardUtils'
import { sumChipStack } from '../utils/chipUtils'
import { MAX_VISUAL_CHIPS } from '../constants/gameConfig'
import { formatMoney } from '../utils/formatters'
import Chip from './Chip'
import styles from './BettingCircle.module.css'

const RESULT_ANIMATE_MS = 1000

const BettingCircle = React.memo(forwardRef(function BettingCircle(
  { chipStack = [], bettedAssets = [], result, onUndo, onRemoveAsset, playerHands = [] },
  ref
) {
  // Local state to delay visual clearing of chips after hand resolution
  const [displayChips, setDisplayChips] = useState(chipStack)
  const [displayAssets, setDisplayAssets] = useState(bettedAssets)
  const [animatingOut, setAnimatingOut] = useState(false)
  const prevChipLenRef = useRef(chipStack.length)
  // Track which chip index is "new" to animate only the landing chip
  const [newChipIndex, setNewChipIndex] = useState(-1)
  const [chipScope, animateChips] = useAnimate()

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const prevLen = prevChipLenRef.current
    prevChipLenRef.current = chipStack.length

    if (prevLen > 0 && chipStack.length === 0 && result) {
      // Chips just cleared (RESOLVE_HAND) — keep displaying for animation
      setAnimatingOut(true)
      setNewChipIndex(-1)
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
      if (chipStack.length > prevLen) {
        setNewChipIndex(chipStack.length - 1)
      } else {
        setNewChipIndex(-1)
      }
    }
  }, [chipStack, bettedAssets, result])
  /* eslint-enable react-hooks/set-state-in-effect */

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

  const chipSelector = `.${styles.stackedChip}`

  useEffect(() => {
    if (!animatingOut || visibleChips.length === 0) return

    if (isWin) {
      animateChips(chipSelector, (i) => ({
        y: 80,
        x: (i - visibleChips.length / 2) * 15,
        rotate: (i - visibleChips.length / 2) * -8,
        scale: 0.5,
        opacity: 0,
      }), { duration: 0.5, delay: stagger(0.04) })
    } else {
      animateChips(chipSelector, () => ({
        x: (Math.random() - 0.5) * 160,
        y: (Math.random() - 0.5) * 120 - 30,
        rotate: (Math.random() - 0.5) * 90,
        scale: 0.3,
        opacity: 0,
      }), { duration: 0.5, delay: stagger(0.03, { from: 'last' }) })
    }
  }, [animatingOut, isWin, animateChips, visibleChips.length, chipSelector])

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
          <div className={styles.chipStack} ref={chipScope}>
            {visibleChips.map((value, i) => {
              const chip = CHIP_MAP[value] || CHIP_MAP[25]
              const visibleStart = displayChips.length - visibleChips.length
              const isNew = newChipIndex >= 0 && i === newChipIndex - visibleStart
              const chipClasses = [
                styles.stackedChip,
                isNew ? styles.chipLanding : '',
              ].filter(Boolean).join(' ')
              return (
                <div
                  key={`${i}-${value}`}
                  className={chipClasses}
                  style={isNew
                    ? { '--land-x': `${i}px`, '--land-y': `${-i * 3}px`, zIndex: i }
                    : { transform: `translate(-50%, -50%) translate(${i}px, ${-i * 3}px)`, zIndex: i }
                  }
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
            {animatingOut && isWin && total > 0 && (
              <m.span
                className={styles.winAmount}
                initial={{ opacity: 0, y: 0, scale: 0.8 }}
                animate={{ opacity: [0, 1, 1, 0], y: -40, scale: [0.8, 1.1, 1.1, 1] }}
                transition={{ duration: 1 }}
              >
                +{formatMoney(total)}
              </m.span>
            )}
          </div>
        )}
        {displayAssets.length > 0 && (
          <div className={styles.assetChips}>
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
