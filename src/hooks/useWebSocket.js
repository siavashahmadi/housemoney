import { useRef, useCallback, useEffect } from 'react'
import { WS_URL } from '../constants/gameConfig'

const MAX_RECONNECT_ATTEMPTS = 3
const RECONNECT_BASE_DELAY = 1000

// Only queue messages that are safe to replay after reconnect.
// Game-action messages (hit, stand, double_down, split, place_bet, etc.)
// must NOT be queued — replaying them after reconnect causes duplicate actions.
const QUEUEABLE_TYPES = new Set(['create_room', 'join_room', 'create_slots_room', 'join_slots_room'])

/**
 * Manages a WebSocket connection to the multiplayer server.
 *
 * Uses a module-level WebSocket reference to survive React StrictMode's
 * mount-unmount-remount cycle in development.
 */

// Module-level state — shared across StrictMode remounts
let activeWs = null
let reconnectAttempts = 0
let reconnectTimer = null
let heartbeatTimeout = null
let pendingMessages = []
const MAX_PENDING_MESSAGES = 10

function resetHeartbeatTimeout() {
  clearTimeout(heartbeatTimeout)
  heartbeatTimeout = setTimeout(() => {
    console.warn('[WS] No heartbeat received in 45s, connection presumed dead')
    if (activeWs) activeWs.close()
  }, 45000)
}

export function useWebSocket(dispatch) {
  const dispatchRef = useRef(dispatch)
  dispatchRef.current = dispatch
  const intentionalCloseRef = useRef(false)

  const connect = useCallback(() => {
    // Don't create duplicate connections
    if (activeWs?.readyState === WebSocket.OPEN ||
        activeWs?.readyState === WebSocket.CONNECTING) {
      // Already connected — just dispatch connected state
      dispatchRef.current({ type: 'WS_CONNECTED' })
      return
    }

    const ws = new WebSocket(WS_URL)

    ws.onopen = () => {
      reconnectAttempts = 0
      dispatchRef.current({ type: 'WS_CONNECTED' })
      resetHeartbeatTimeout()

      // Check for reconnection data
      const savedPlayerId = sessionStorage.getItem('mp_player_id')
      const savedRoomCode = sessionStorage.getItem('mp_room_code')
      const savedSessionToken = sessionStorage.getItem('mp_session_token')
      if (savedPlayerId && savedRoomCode) {
        ws.send(JSON.stringify({
          type: 'reconnect',
          player_id: savedPlayerId,
          code: savedRoomCode,
          session_token: savedSessionToken || '',
        }))
      }
    }

    ws.onmessage = (event) => {
      let message
      try {
        message = JSON.parse(event.data)
      } catch (e) {
        console.warn('[WS] Failed to parse message:', e)
        return
      }

      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }))
        resetHeartbeatTimeout()
        return
      }

      // Persist session data
      if (message.type === 'room_created') {
        if (message.player_id) sessionStorage.setItem('mp_player_id', message.player_id)
        if (message.code) sessionStorage.setItem('mp_room_code', message.code)
        if (message.session_token) sessionStorage.setItem('mp_session_token', message.session_token)
      }
      if (message.type === 'slots_room_created') {
        if (message.player_id) sessionStorage.setItem('mp_player_id', message.player_id)
        if (message.code) sessionStorage.setItem('mp_room_code', message.code)
        if (message.session_token) sessionStorage.setItem('mp_session_token', message.session_token)
      }
      if (message.type === 'player_joined' && !sessionStorage.getItem('mp_player_id')) {
        if (message.player_id) sessionStorage.setItem('mp_player_id', message.player_id)
        if (message.code) sessionStorage.setItem('mp_room_code', message.code)
        if (message.session_token) sessionStorage.setItem('mp_session_token', message.session_token)
      }
      if (message.type === 'slots_player_joined' && !sessionStorage.getItem('mp_player_id')) {
        if (message.player_id) sessionStorage.setItem('mp_player_id', message.player_id)
        if (message.code) sessionStorage.setItem('mp_room_code', message.code)
        if (message.session_token) sessionStorage.setItem('mp_session_token', message.session_token)
      }
      if (message.type === 'reconnected') {
        if (message.player_id) sessionStorage.setItem('mp_player_id', message.player_id)
        if (message.code) sessionStorage.setItem('mp_room_code', message.code)
        if (message.session_token) sessionStorage.setItem('mp_session_token', message.session_token)
      }
      if (message.type === 'left_room' || message.type === 'reconnect_failed') {
        sessionStorage.removeItem('mp_player_id')
        sessionStorage.removeItem('mp_room_code')
        sessionStorage.removeItem('mp_session_token')
        pendingMessages = []
      }

      // Reset reconnect counter only on confirmed room success
      if (message.type === 'room_created' || message.type === 'player_joined' || message.type === 'reconnected' ||
          message.type === 'slots_room_created' || message.type === 'slots_player_joined') {
        reconnectAttempts = 0
        // Flush any messages queued while disconnected
        if (pendingMessages.length > 0) {
          const toSend = [...pendingMessages]
          pendingMessages = []
          for (const msg of toSend) {
            if (activeWs?.readyState === WebSocket.OPEN) {
              activeWs.send(JSON.stringify(msg))
            }
          }
        }
      }

      if (!message.type || typeof message.type !== 'string') {
        console.warn('[WS] Received message without valid type:', message)
        return
      }

      const actionType = `SERVER_${message.type.toUpperCase()}`
      dispatchRef.current({ type: actionType, payload: message })
    }

    ws.onclose = () => {
      clearTimeout(heartbeatTimeout)
      // Only dispatch if this is still the active WebSocket
      if (activeWs === ws) {
        activeWs = null
        dispatchRef.current({ type: 'WS_DISCONNECTED' })

        if (intentionalCloseRef.current) {
          intentionalCloseRef.current = false
          return
        }

        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const baseDelay = RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts)
          const delay = baseDelay * (0.5 + Math.random())
          reconnectAttempts++
          reconnectTimer = setTimeout(() => connect(), delay)
        } else {
          sessionStorage.removeItem('mp_player_id')
          sessionStorage.removeItem('mp_room_code')
          sessionStorage.removeItem('mp_session_token')
          dispatchRef.current({ type: 'SERVER_ERROR', payload: { message: 'Connection lost. Please refresh to reconnect.' } })
        }
      }
    }

    ws.onerror = (event) => {
      console.error('[WS] WebSocket error:', event)
    }

    activeWs = ws
  }, [])

  const send = useCallback((message) => {
    if (!activeWs || activeWs.readyState !== WebSocket.OPEN) {
      if (QUEUEABLE_TYPES.has(message.type)) {
        if (pendingMessages.length >= MAX_PENDING_MESSAGES) {
          pendingMessages.shift() // drop oldest — newest reflects latest intent
        }
        pendingMessages.push(message)
        console.warn('[WS] Queued message — not connected:', message.type)
      } else {
        console.warn('[WS] Dropped non-queueable message — not connected:', message.type)
      }
      return
    }
    activeWs.send(JSON.stringify(message))
  }, [])

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true
    clearTimeout(reconnectTimer)
    clearTimeout(heartbeatTimeout)
    reconnectAttempts = 0
    pendingMessages = []
    sessionStorage.removeItem('mp_player_id')
    sessionStorage.removeItem('mp_room_code')
    sessionStorage.removeItem('mp_session_token')
    dispatchRef.current({ type: 'WS_DISCONNECTED' })
    if (activeWs) {
      activeWs.close()
      activeWs = null
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      // In StrictMode dev, this cleanup runs then re-mounts.
      // Don't close the WS here — let it stay alive.
      // Only close on true unmount (handled by disconnect or page unload).
    }
  }, [connect])

  // Close on actual page unload
  useEffect(() => {
    const handleUnload = () => {
      if (activeWs) {
        activeWs.close()
        activeWs = null
      }
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])

  return { send, disconnect }
}
