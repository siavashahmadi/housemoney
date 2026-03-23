import { useEffect, useRef } from 'react'
import audioManager from '../utils/audioManager'

/**
 * Sound effects for multiplayer mode.
 * Monitors multiplayer state transitions and triggers appropriate sounds.
 * Chip sounds during betting are handled directly in MultiplayerGame handlers.
 */
export function useMultiplayerSound(state) {
  const prevRef = useRef(state)
  const initRef = useRef(false)

  // Initialize AudioContext on first user gesture
  useEffect(() => {
    if (initRef.current) return
    const handler = () => {
      audioManager.init()
      initRef.current = true
      document.removeEventListener('pointerdown', handler)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [])

  // Sync mute state
  useEffect(() => {
    audioManager.setMuted(state.muted)
  }, [state.muted])

  useEffect(() => {
    const prev = prevRef.current

    // Cards dealt — transition from betting to playing
    if (prev.phase === 'betting' && state.phase === 'playing') {
      const playerCount = Object.keys(state.playerStates).length
      const totalCards = (playerCount + 1) * 2  // players + dealer
      for (let i = 0; i < totalCards; i++) {
        setTimeout(() => audioManager.play('card_deal'), i * 120)
      }
    }

    // Player hit — any player's hand grew during playing phase
    if (state.phase === 'playing' && prev.phase === 'playing') {
      for (const [id, player] of Object.entries(state.playerStates)) {
        const prevPlayer = prev.playerStates[id]
        if (prevPlayer && player.hand?.length > prevPlayer.hand?.length) {
          audioManager.play('card_deal')
          break
        }
      }
    }

    // Dealer draws during dealer turn
    if (state.phase === 'dealer_turn' && prev.phase === 'dealer_turn') {
      if (state.dealerHand.length > prev.dealerHand.length) {
        audioManager.play('card_deal')
      }
    }

    // Hole card reveal — transition to dealer turn
    if (prev.phase === 'playing' && state.phase === 'dealer_turn') {
      audioManager.play('card_flip')
    }

    // Result sounds — based on local player's result
    if (state.phase === 'result' && prev.phase !== 'result') {
      const localPlayer = state.playerStates[state.playerId]
      if (localPlayer?.result) {
        const r = localPlayer.result
        if (r === 'blackjack') audioManager.play('blackjack')
        else if (r === 'win' || r === 'dealerBust') audioManager.play('win')
        else if (r === 'bust') audioManager.play('bust')
        else if (r === 'lose') audioManager.play('lose')
      }
    }

    prevRef.current = state
  }, [state])
}
