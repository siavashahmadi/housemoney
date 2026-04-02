import React, { useEffect } from 'react'
import styles from './CompToast.module.css'

function CompToast({ comp, onDismiss }) {
  useEffect(() => {
    if (!comp) return
    const timer = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timer)
  }, [comp, onDismiss])

  if (!comp) return null

  return (
    <div className={styles.overlay} onClick={onDismiss}>
      <div className={styles.toast} key={comp.title}>
        <span className={styles.label}>CASINO COMP</span>
        <h3 className={styles.title}>{comp.title}</h3>
        <p className={styles.message}>{comp.message}</p>
        <span className={styles.dismiss}>Tap to dismiss</span>
      </div>
    </div>
  )
}

export default React.memo(CompToast)
