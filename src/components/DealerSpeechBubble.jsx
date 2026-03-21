import styles from './DealerSpeechBubble.module.css'

function DealerSpeechBubble({ message }) {
  if (!message) return null

  return (
    <div className={styles.bubble} key={message}>
      <p className={styles.text}>{message}</p>
      <div className={styles.tail} />
    </div>
  )
}

export default DealerSpeechBubble
