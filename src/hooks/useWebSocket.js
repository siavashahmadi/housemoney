import { useRef, useCallback, useEffect } from 'react'
import { WS_URL } from '../constants/gameConfig'

const MAX_RECONNECT_ATTEMPTS = 3
const RECONNECT_BASE_DELAY = 1000

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
      dispatchRef.current({ type: 'WS_CONNECTED' })
      reconnectAttempts = 0
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
      } catch {
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
      if (message.type === 'player_joined' && !sessionStorage.getItem('mp_player_id')) {
        if (message.player_id) sessionStorage.setItem('mp_player_id', message.player_id)
        if (message.code) sessionStorage.setItem('mp_room_code', message.code)
        if (message.session_token) sessionStorage.setItem('mp_session_token', message.session_token)
      }
      if (message.type === 'reconnected') {
        if (message.player_id) sessionStorage.setItem('mp_player_id', message.player_id)
        if (message.code) sessionStorage.setItem('mp_room_code', message.code)
        if (message.session_token) sessionStorage.setItem('mp_session_token', message.session_token)
      }
      if (message.type === 'left_room') {
        sessionStorage.removeItem('mp_player_id')
        sessionStorage.removeItem('mp_room_code')
        sessionStorage.removeItem('mp_session_token')
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
          const delay = RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts)
          reconnectAttempts++
          reconnectTimer = setTimeout(() => connect(), delay)
        } else {
          sessionStorage.removeItem('mp_player_id')
          sessionStorage.removeItem('mp_room_code')
          sessionStorage.removeItem('mp_session_token')
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
      console.warn('[WS] Cannot send — not connected')
      return
    }
    activeWs.send(JSON.stringify(message))
  }, [])

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true
    clearTimeout(reconnectTimer)
    clearTimeout(heartbeatTimeout)
    reconnectAttempts = 0
    sessionStorage.removeItem('mp_player_id')
    sessionStorage.removeItem('mp_room_code')
    sessionStorage.removeItem('mp_session_token')
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
