import { useState, useRef, useCallback } from 'react'
import { SLOTS_BATTLE_SET_NAME, SLOTS_BATTLE_CLEAR_ERROR, SLOTS_BATTLE_FORCE_LEAVE } from '../../reducer/slotsBattleReducer'
import { ROUND_OPTIONS } from '../../constants/slotSymbols'
import { formatMoney } from '../../utils/formatters'
import styles from './SlotsLobby.module.css'

const VALID_BETS = [100, 500, 1000, 5000]
const BET_LABELS = { 100: '$100', 500: '$500', 1000: '$1K', 5000: '$5K' }

function SlotsLobby({ state, send, dispatch, onBack }) {
  const [view, setView] = useState('main') // 'main' | 'join'
  const [roomCodeInput, setRoomCodeInput] = useState(['', '', '', ''])
  const codeInputRefs = useRef([])
  const [copied, setCopied] = useState(false)

  const inRoom = state.phase === 'lobby' && state.roomCode

  const handleNameChange = useCallback((e) => {
    dispatch({ type: SLOTS_BATTLE_SET_NAME, name: e.target.value.slice(0, 20) })
  }, [dispatch])

  const handleCreate = useCallback(() => {
    dispatch({ type: SLOTS_BATTLE_CLEAR_ERROR })
    if (!state.playerName.trim()) return
    send({ type: 'create_slots_room', player_name: state.playerName.trim() })
  }, [send, state.playerName, dispatch])

  const handleJoin = useCallback(() => {
    dispatch({ type: SLOTS_BATTLE_CLEAR_ERROR })
    const code = roomCodeInput.join('').toUpperCase()
    if (code.length !== 4 || !state.playerName.trim()) return
    send({ type: 'join_slots_room', code, player_name: state.playerName.trim() })
  }, [send, roomCodeInput, state.playerName, dispatch])

  const handleStart = useCallback(() => {
    dispatch({ type: SLOTS_BATTLE_CLEAR_ERROR })
    send({ type: 'start_slots' })
  }, [send, dispatch])

  const handleLeave = useCallback(() => {
    if (state.connected) {
      send({ type: 'leave_slots' })
    }
    sessionStorage.removeItem('mp_player_id')
    sessionStorage.removeItem('mp_room_code')
    sessionStorage.removeItem('mp_session_token')
    dispatch({ type: SLOTS_BATTLE_FORCE_LEAVE })
  }, [send, state.connected, dispatch])

  const handleConfigureRounds = useCallback((rounds) => {
    send({ type: 'configure_slots', total_rounds: rounds })
  }, [send])

  const handleConfigureBet = useCallback((bet) => {
    send({ type: 'configure_slots', bet_per_round: bet })
  }, [send])

  const handleCodeInput = useCallback((index, value) => {
    const char = value.slice(-1).toUpperCase()
    if (char && !/[A-Z0-9]/.test(char)) return

    setRoomCodeInput(prev => {
      const next = [...prev]
      next[index] = char
      return next
    })

    if (char && index < 3) {
      codeInputRefs.current[index + 1]?.focus()
    }
  }, [])

  const handleCodeKeyDown = useCallback((index, e) => {
    if (e.key === 'Backspace' && !roomCodeInput[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus()
    }
    if (e.key === 'Enter') {
      handleJoin()
    }
  }, [roomCodeInput, handleJoin])

  const handleCodePaste = useCallback((e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
    if (pasted.length > 0) {
      const next = ['', '', '', '']
      for (let i = 0; i < pasted.length; i++) {
        next[i] = pasted[i]
      }
      setRoomCodeInput(next)
      const focusIdx = Math.min(pasted.length, 3)
      codeInputRefs.current[focusIdx]?.focus()
    }
  }, [])

  const copyRoomCode = useCallback(async () => {
    if (!state.roomCode) return
    try {
      await navigator.clipboard.writeText(state.roomCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: noop
    }
  }, [state.roomCode])

  // --- Waiting room ---
  if (inRoom) {
    const connectedCount = state.players.filter(p => p.connected).length
    const canStart = state.isHost && connectedCount >= 2
    const buyIn = state.totalRounds * state.betPerRound

    return (
      <div className={styles.container}>
        <div className={styles.waitingRoom}>
          <span className={styles.waitingLabel}>ROOM CODE</span>
          <button className={styles.roomCode} onClick={copyRoomCode}>
            {state.roomCode}
            <span className={styles.copyHint}>{copied ? 'Copied!' : 'Tap to copy'}</span>
          </button>

          <div className={styles.playerList}>
            <span className={styles.playerListLabel}>
              PLAYERS ({connectedCount}/{state.players.length})
            </span>
            {state.players.map(p => (
              <div key={p.player_id} className={styles.playerItem}>
                <span className={`${styles.statusDot} ${p.connected ? styles.online : styles.offline}`} />
                <span className={styles.playerName}>
                  {p.name}
                  {p.player_id === state.playerId && <span className={styles.youBadge}>YOU</span>}
                </span>
                {p.is_host && <span className={styles.hostBadge}>HOST</span>}
              </div>
            ))}
          </div>

          {state.isHost ? (
            <div className={styles.configPanel}>
              <span className={styles.configLabel}>ROUNDS</span>
              <div className={styles.configRow}>
                {ROUND_OPTIONS.map(r => (
                  <button
                    key={r}
                    className={`${styles.configOption} ${state.totalRounds === r ? styles.configOptionActive : ''}`}
                    onClick={() => handleConfigureRounds(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <span className={styles.configLabel}>BET PER ROUND</span>
              <div className={styles.configRow}>
                {VALID_BETS.map(b => (
                  <button
                    key={b}
                    className={`${styles.configOption} ${state.betPerRound === b ? styles.configOptionActive : ''}`}
                    onClick={() => handleConfigureBet(b)}
                  >
                    {BET_LABELS[b]}
                  </button>
                ))}
              </div>

              <div className={styles.buyInDisplay}>
                BUY-IN: <span className={styles.buyInAmount}>{formatMoney(buyIn)}</span>
              </div>
            </div>
          ) : (
            <div className={styles.configDisplay}>
              <div className={styles.configDisplayRow}>
                <span className={styles.configDisplayLabel}>Rounds</span>
                <span className={styles.configDisplayValue}>{state.totalRounds}</span>
              </div>
              <div className={styles.configDisplayRow}>
                <span className={styles.configDisplayLabel}>Bet/Round</span>
                <span className={styles.configDisplayValue}>{formatMoney(state.betPerRound)}</span>
              </div>
              <div className={styles.configDisplayRow}>
                <span className={styles.configDisplayLabel}>Buy-in</span>
                <span className={styles.configDisplayValue}>{formatMoney(buyIn)}</span>
              </div>
            </div>
          )}

          {state.isHost && (
            <button
              className={styles.startButton}
              onClick={handleStart}
              disabled={!canStart}
            >
              {canStart ? 'START BATTLE' : 'WAITING FOR PLAYERS...'}
            </button>
          )}
          {!state.isHost && (
            <div className={styles.waitingHint}>Waiting for host to start...</div>
          )}

          <button className={styles.leaveButton} onClick={handleLeave}>
            LEAVE ROOM
          </button>
        </div>

        {state.error && (
          <div className={styles.error}>{state.error}</div>
        )}
      </div>
    )
  }

  // --- Main view ---
  return (
    <div className={styles.container}>
      <button className={styles.backButton} onClick={onBack}>
        &larr; BACK
      </button>

      <div className={styles.brand}>
        <h1 className={styles.logo}>SLOTS BATTLE</h1>
        <span className={styles.subtitle}>COMPETE WITH FRIENDS</span>
      </div>

      {!state.connected && (
        <div className={styles.connecting}>Connecting to server...</div>
      )}

      {state.connected && view === 'main' && (
        <div className={styles.mainView}>
          <input
            className={styles.nameInput}
            type="text"
            placeholder="Your name"
            value={state.playerName}
            onChange={handleNameChange}
            maxLength={20}
            autoComplete="off"
          />

          <button
            className={styles.createButton}
            onClick={handleCreate}
            disabled={!state.playerName.trim()}
          >
            CREATE ROOM
          </button>

          <div className={styles.divider}>
            <span className={styles.dividerLine} />
            <span className={styles.dividerText}>OR</span>
            <span className={styles.dividerLine} />
          </div>

          <button
            className={styles.joinViewButton}
            onClick={() => setView('join')}
          >
            JOIN A ROOM
          </button>
        </div>
      )}

      {state.connected && view === 'join' && (
        <div className={styles.joinView}>
          <input
            className={styles.nameInput}
            type="text"
            placeholder="Your name"
            value={state.playerName}
            onChange={handleNameChange}
            maxLength={20}
            autoComplete="off"
          />

          <span className={styles.codeLabel}>ROOM CODE</span>
          <div className={styles.codeInputRow}>
            {[0, 1, 2, 3].map(i => (
              <input
                key={i}
                ref={el => codeInputRefs.current[i] = el}
                className={styles.codeChar}
                type="text"
                inputMode="text"
                maxLength={1}
                value={roomCodeInput[i]}
                onChange={e => handleCodeInput(i, e.target.value)}
                onKeyDown={e => handleCodeKeyDown(i, e)}
                onPaste={i === 0 ? handleCodePaste : undefined}
                autoCapitalize="characters"
                autoComplete="off"
              />
            ))}
          </div>

          <button
            className={styles.joinButton}
            onClick={handleJoin}
            disabled={!state.playerName.trim() || roomCodeInput.join('').length !== 4}
          >
            JOIN ROOM
          </button>

          <button
            className={styles.backToMain}
            onClick={() => setView('main')}
          >
            BACK
          </button>
        </div>
      )}

      {state.error && (
        <div className={styles.error}>{state.error}</div>
      )}
    </div>
  )
}

export default SlotsLobby
