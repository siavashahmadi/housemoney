import { memo } from 'react'
import { SUIT_SYMBOLS, SUIT_COLORS } from '../constants/cards'
import { PIP_LAYOUTS } from '../constants/pipLayouts'
import { FACE_CARD_CONFIG } from '../constants/faceCards'
import styles from './Card.module.css'

const FACE_RANKS = new Set(['J', 'Q', 'K'])
const NUMBER_RANKS = new Set(['2', '3', '4', '5', '6', '7', '8', '9', '10'])

function renderPips(rank, symbol, size) {
  if (size === 'small') {
    return <span className={styles.centerSuit}>{symbol}</span>
  }

  // Medium and normal both show full pip layout

  const layout = PIP_LAYOUTS[parseInt(rank, 10)]
  if (!layout) return <span className={styles.centerSuit}>{symbol}</span>

  return (
    <div className={styles.cardBody}>
      <div className={styles.pipZone}>
        {layout.map((pip, i) => (
          <span
            key={i}
            className={pip.flip ? styles.pipFlipped : styles.pip}
            style={{ left: `${pip.x}%`, top: `${pip.y}%` }}
          >
            {symbol}
          </span>
        ))}
      </div>
    </div>
  )
}

function renderFaceCard(rank, symbol, size) {
  if (size === 'small') {
    return <span className={styles.centerSuit}>{symbol}</span>
  }

  const config = FACE_CARD_CONFIG[rank]
  const accent = config ? config.accentChar : ''

  return (
    <div className={styles.cardBody}>
      <div className={styles.faceCardArt}>
        <span className={styles.faceCardAccent}>{accent}</span>
        <span className={styles.faceCardRank}>{rank}</span>
        <span className={styles.faceCardSuit}>{symbol}</span>
        <span className={styles.faceCardAccentBottom}>{accent}</span>
      </div>
    </div>
  )
}

function renderAce(symbol, size) {
  if (size === 'small') {
    return <span className={styles.centerSuit}>{symbol}</span>
  }

  return (
    <div className={styles.cardBody}>
      <div className={styles.aceCenter}>
        <span className={styles.aceSuit}>{symbol}</span>
      </div>
    </div>
  )
}

const Card = memo(function Card({ card, faceDown = false, size = 'normal' }) {
  if (!card) return null

  // Server sends {rank: "?", suit: "?"} for hidden hole card
  const isHidden = faceDown || card.rank === '?'
  const sizeClass = size === 'small' ? styles.small : size === 'medium' ? styles.medium : ''
  const cardClass = `${styles.card}${sizeClass ? ` ${sizeClass}` : ''}`

  if (isHidden) {
    return (
      <div className={cardClass}>
        <div className={styles.back} />
      </div>
    )
  }

  const symbol = SUIT_SYMBOLS[card.suit]
  const colorClass = SUIT_COLORS[card.suit] === 'red' ? styles.red : styles.black

  let bodyContent
  if (card.rank === 'A') {
    bodyContent = renderAce(symbol, size)
  } else if (FACE_RANKS.has(card.rank)) {
    bodyContent = renderFaceCard(card.rank, symbol, size)
  } else if (NUMBER_RANKS.has(card.rank)) {
    bodyContent = renderPips(card.rank, symbol, size)
  } else {
    bodyContent = <span className={styles.centerSuit}>{symbol}</span>
  }

  return (
    <div className={cardClass}>
      <div className={`${styles.face} ${colorClass}`}>
        <div className={styles.cornerTopLeft}>
          <span className={styles.rank}>{card.rank}</span>
          <span className={styles.suitSmall}>{symbol}</span>
        </div>
        {bodyContent}
        <div className={styles.cornerBottomRight}>
          <span className={styles.rank}>{card.rank}</span>
          <span className={styles.suitSmall}>{symbol}</span>
        </div>
      </div>
    </div>
  )
})

export default Card
