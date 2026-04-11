import React from 'react'
import { m } from 'motion/react'
import Hand from './Hand'
import { handValue, isWinResult, isLossResult } from '../utils/cardUtils'
import { formatMoney } from '../utils/formatters'
import { RESULTS } from '../constants/results'
import styles from './PlayerArea.module.css'

function getValueAnimation(value) {
  if (value > 21) return { initial: { scale: 1.25 }, animate: { scale: 1 } }
  if (value >= 18) return { initial: { scale: 1.25 }, animate: { scale: 1 } }
  return { initial: { scale: 1.25 }, animate: { scale: 1 } }
}

const valueTransition = { type: 'spring', stiffness: 300, damping: 20 }

function getCardSize(handCount) {
  if (handCount <= 1) return 'normal'
  if (handCount === 2) return 'medium'
  return 'small'
}

function PlayerArea({ playerHands, activeHandIndex, phase, bettedAssets }) {
  const handCount = playerHands.length
  const hasCards = handCount > 0 && playerHands.some(h => h.cards.length > 0)
  const cardSize = getCardSize(handCount)
  const dealType = phase === 'playing' ? 'hit' : 'deal'

  if (!hasCards) {
    return (
      <div className={styles.area}>
        <span className={styles.value}>{'\u00A0'}</span>
        <div className={styles.handWrapper}>
          <div className={styles.empty} />
        </div>
        <span className={styles.label}>YOUR HAND</span>
      </div>
    )
  }

  // Single hand — original layout
  if (handCount === 1) {
    const hand = playerHands[0]
    const value = handValue(hand.cards)
    const anim = getValueAnimation(value)
    const resultGlow = phase === 'result' && hand.result
      ? isWinResult(hand.result) ? styles.glowWin : isLossResult(hand.result) ? styles.glowLose : ''
      : ''
    return (
      <div className={styles.area}>
        {hand.cards.length > 0 ? (
          <m.span
            className={`${styles.value}${value > 21 ? ` ${styles.bust}` : value >= 18 ? ` ${styles.warning}` : ''}`}
            initial={anim.initial}
            animate={anim.animate}
            transition={valueTransition}
          >
            {value}
          </m.span>
        ) : (
          <span className={styles.value}>{'\u00A0'}</span>
        )}
        <div className={`${styles.handWrapper}${resultGlow ? ` ${resultGlow}` : ''}`}>
          <Hand cards={hand.cards} dealType={dealType} />
        </div>
        <span className={styles.label}>YOUR HAND</span>
      </div>
    )
  }

  // Multiple hands — side by side
  return (
    <div className={styles.area}>
      <div className={styles.handsContainer}>
        {playerHands.map((hand, i) => {
          const value = hand.cards.length > 0 ? handValue(hand.cards) : 0
          const isActive = i === activeHandIndex && phase === 'playing'
          const isDone = hand.status === 'bust' || hand.status === 'standing' || hand.status === 'done'
          const showResult = hand.result && phase === 'result'
          const handGlow = phase === 'result' && hand.result
            ? isWinResult(hand.result) ? styles.glowWin : isLossResult(hand.result) ? styles.glowLose : ''
            : ''
          const handAnim = getValueAnimation(value)

          return (
            <div
              key={i}
              className={`${styles.singleHand}${isActive ? ` ${styles.activeHand}` : ''}${hand.status === 'bust' && phase !== 'result' ? ` ${styles.bustHand}` : ''}${handGlow ? ` ${handGlow}` : ''}`}
            >
              <div className={styles.handHeader}>
                <m.span
                  className={`${styles.handValue}${value > 21 ? ` ${styles.bust}` : value >= 18 ? ` ${styles.warning}` : ''}`}
                  initial={handAnim.initial}
                  animate={handAnim.animate}
                  transition={valueTransition}
                >
                  {value}
                </m.span>
                {hand.isDoubledDown && <span className={styles.ddBadge}>2x</span>}
              </div>
              <Hand cards={hand.cards} size={cardSize} dealType={dealType} />
              {phase === 'playing' && (
                isDone ? (
                  <span className={`${styles.statusBadge} ${styles[`status_${hand.status}`]}`}>
                    {hand.status === 'bust' ? 'BUST' : hand.status === 'standing' ? 'STANDING' : ''}
                  </span>
                ) : isActive ? (
                  <span className={`${styles.statusBadge} ${styles.status_playing}`}>PLAYING</span>
                ) : null
              )}
              {showResult && (
                <span className={`${styles.resultBadge} ${styles[`result_${hand.result}`]}`}>
                  {hand.result === RESULTS.DEALER_BUST ? 'WIN' : hand.result.toUpperCase()}
                </span>
              )}
              <span className={styles.handBet}>
                {formatMoney(hand.bet)}
                {i === 0 && bettedAssets && bettedAssets.length > 0 && (
                  <span className={styles.assetBadges}>
                    {bettedAssets.map(a => <span key={a.id}>{a.emoji}</span>)}
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>
      <span className={styles.label}>
        {phase === 'playing'
          ? `HAND ${activeHandIndex + 1} OF ${handCount}`
          : `${handCount} HANDS`
        }
      </span>
    </div>
  )
}

export default React.memo(PlayerArea)
