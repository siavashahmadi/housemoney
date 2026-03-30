import React, { useEffect } from 'react'
import styles from './LoanSharkPopup.module.css'

function LoanSharkPopup({ message, onDismiss }) {
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timer)
  }, [message, onDismiss])

  if (!message) return null

  return (
    <div className={styles.overlay} onClick={onDismiss}>
      <div className={styles.popup} key={message}>
        <p className={styles.message}>{message}</p>
        <span className={styles.dismiss}>Tap to dismiss</span>
      </div>
    </div>
  )
}

export default React.memo(LoanSharkPopup)
