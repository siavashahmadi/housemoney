import React, { useState, useEffect } from 'react'
import { m, AnimatePresence } from 'motion/react'
import styles from './DealerSpeechBubble.module.css'

const DISPLAY_MS = 4000

function DealerSpeechBubble({ message, dealerName }) {
  const [visible, setVisible] = useState(false)
  const [displayedText, setDisplayedText] = useState('')

  useEffect(() => {
    if (!message) {
      setVisible(false)
      return
    }

    setVisible(true)

    const hideTimer = setTimeout(() => setVisible(false), DISPLAY_MS)

    return () => {
      clearTimeout(hideTimer)
    }
  }, [message])

  useEffect(() => {
    if (!message) {
      setDisplayedText('')
      return
    }

    setDisplayedText('')
    let index = 0
    const interval = Math.min(300 / message.length, 30)
    const timer = setInterval(() => {
      index++
      setDisplayedText(message.slice(0, index))
      if (index >= message.length) clearInterval(timer)
    }, interval)

    return () => clearInterval(timer)
  }, [message])

  return (
    <AnimatePresence>
      {visible && message && (
        <m.div
          className={styles.bubble}
          key={message}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.3 }}
        >
          {dealerName && <span className={styles.dealerName}>{dealerName}</span>}
          <p className={styles.text}>{displayedText}</p>
          <div className={styles.tail} />
        </m.div>
      )}
    </AnimatePresence>
  )
}

export default React.memo(DealerSpeechBubble)
