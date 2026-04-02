import React, { useState, useCallback, useEffect, useRef } from 'react'
import { TABLE_LEVELS } from '../constants/tableLevels'
import styles from './Header.module.css'

function getSubtitle(bankroll, tableLevel) {
  if (tableLevel !== undefined && tableLevel >= 0 && TABLE_LEVELS[tableLevel]) {
    return TABLE_LEVELS[tableLevel].subtitle
  }
  return 'HIGH STAKES'
}

function Header({
  bankroll,
  tableLevel,
  onReset,
  unlockedCount,
  onToggleAchievements,
  onToggleDebtTracker,
  onToggleHandHistory,
  muted,
  onToggleMute,
  notificationsEnabled,
  onToggleNotifications,
  onBack,
  // Multiplayer props
  mode,
  roomCode,
  onLeave,
  isHost,
  onViewStats,
}) {
  const [copied, setCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  const handleCopyCode = useCallback(async () => {
    if (!roomCode) return
    try {
      await navigator.clipboard.writeText(roomCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }, [roomCode])

  const isMultiplayer = mode === 'multiplayer'

  const toggleMenu = useCallback(() => setMenuOpen(prev => !prev), [])
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  // Close menu when tapping outside
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', handleClick)
    return () => document.removeEventListener('pointerdown', handleClick)
  }, [menuOpen])

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <h1 className={styles.logo}>BLACKJACK</h1>
        {isMultiplayer && roomCode ? (
          <button className={styles.roomCodeButton} onClick={handleCopyCode}>
            {copied ? 'Copied!' : roomCode}
          </button>
        ) : (
          <span className={styles.subtitle}>{getSubtitle(bankroll, tableLevel)}</span>
        )}
      </div>
      <div className={styles.menuWrapper} ref={menuRef}>
        <button className={styles.hamburger} onClick={toggleMenu} aria-label="Menu">
          <span className={styles.hamburgerLine} />
          <span className={styles.hamburgerLine} />
          <span className={styles.hamburgerLine} />
        </button>
        {menuOpen && (
          <div className={styles.dropdown}>
            {onBack && (
              <button className={styles.menuItem} onClick={() => { closeMenu(); onBack(); }}>
                Home
              </button>
            )}
            {!isMultiplayer && (
              <button className={styles.menuItem} onClick={() => { closeMenu(); onToggleAchievements(); }}>
                <span>Achievements</span>
                {unlockedCount > 0 && (
                  <span className={styles.menuBadge}>{unlockedCount}</span>
                )}
              </button>
            )}
            <button className={styles.menuItem} onClick={() => { closeMenu(); onToggleDebtTracker?.(); }}>
              Financial Journey
            </button>
            {!isMultiplayer && onToggleHandHistory && (
              <button className={styles.menuItem} onClick={() => { closeMenu(); onToggleHandHistory(); }}>
                Hand History
              </button>
            )}
            {!isMultiplayer && (
              <button className={styles.menuItem} onClick={() => { closeMenu(); onToggleNotifications(); }}>
                Notifications {notificationsEnabled ? 'On' : 'Off'}
              </button>
            )}
            <button className={styles.menuItem} onClick={() => { closeMenu(); onToggleMute(); }}>
              Sound {muted ? 'Off' : 'On'}
            </button>
            {isMultiplayer && isHost && (
              <button className={styles.menuItem} onClick={() => { closeMenu(); onViewStats(); }}>
                Stats
              </button>
            )}
            <div className={styles.menuDivider} />
            {isMultiplayer ? (
              <button className={`${styles.menuItem} ${styles.menuDanger}`} onClick={() => { closeMenu(); onLeave(); }}>
                Leave Room
              </button>
            ) : (
              <button className={`${styles.menuItem} ${styles.menuDanger}`} onClick={() => { closeMenu(); onReset(); }}>
                New Game
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  )
}

export default React.memo(Header)
