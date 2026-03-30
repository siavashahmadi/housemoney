import { useState, useEffect, useCallback, useRef } from 'react'
import { QUICK_CHAT_MESSAGES } from '../constants/quickChatMessages'
import styles from './QuickChat.module.css'

function QuickChat({ chatMessages, dispatch, send, playerId }) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [isCooldown, setIsCooldown] = useState(false)

  const handleSend = useCallback((messageId) => {
    if (isCooldown) return
    send({ type: 'quick_chat', message_id: messageId })
    setPanelOpen(false)
    setIsCooldown(true)
    setTimeout(() => setIsCooldown(false), 2000)
  }, [send, isCooldown])

  return (
    <>
      {/* Chat button */}
      <button
        className={styles.chatButton}
        onClick={() => setPanelOpen(prev => !prev)}
        aria-label="Quick chat"
      >
        💬
      </button>

      {/* Message panel */}
      {panelOpen && (
        <div className={styles.panelBackdrop} onClick={() => setPanelOpen(false)}>
          <div className={styles.panel} onClick={e => e.stopPropagation()}>
            {QUICK_CHAT_MESSAGES.map(msg => (
              <button
                key={msg.id}
                className={styles.messageButton}
                onClick={() => handleSend(msg.id)}
                disabled={isCooldown}
              >
                {msg.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat toasts */}
      <div className={styles.toastContainer}>
        {chatMessages.map(msg => (
          <ChatToast
            key={msg.id}
            message={msg}
            onDismiss={() => dispatch({ type: 'DISMISS_CHAT_MESSAGE', id: msg.id })}
          />
        ))}
      </div>
    </>
  )
}

function ChatToast({ message, onDismiss }) {
  const onDismissRef = useRef(onDismiss)

  useEffect(() => {
    onDismissRef.current = onDismiss
  })

  useEffect(() => {
    const timer = setTimeout(() => onDismissRef.current(), 3000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className={styles.toast}>
      <span className={styles.toastName}>{message.playerName}</span>
      <span className={styles.toastText}>{message.text}</span>
    </div>
  )
}

export default QuickChat
