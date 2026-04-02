import React, { useState, useEffect } from 'react'
import styles from './DealerSpeechBubble.module.css'

const DISPLAY_MS = 4000
const FADE_MS = 600

function DealerSpeechBubble({ message, dealerName }) {
  const [visible, setVisible] = useState(false)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (!message) {
      setVisible(false)
      setFading(false)
      return
    }

    setVisible(true)
    setFading(false)

    const fadeTimer = setTimeout(() => setFading(true), DISPLAY_MS)
    const hideTimer = setTimeout(() => setVisible(false), DISPLAY_MS + FADE_MS)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(hideTimer)
    }
  }, [message])

  if (!visible || !message) return null

  return (
    <div className={`${styles.bubble}${fading ? ` ${styles.fadeOut}` : ''}`} key={message}>
      {dealerName && <span className={styles.dealerName}>{dealerName}</span>}
      <p className={styles.text}>{message}</p>
      <div className={styles.tail} />
    </div>
  )
}

export default React.memo(DealerSpeechBubble)
