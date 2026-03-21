import { useEffect, useRef } from 'react'
import audioManager from '../utils/audioManager'

export function useSound(state) {
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

  // Trigger sounds on state transitions
  useEffect(() => {
    const prev = prevRef.current

    // Chip sounds are handled directly in App.jsx handleChipTap for instant feedback

    // Deal — phase changed from betting to playing (4 cards dealt)
    if (prev.phase === 'betting' && state.phase === 'playing') {
      for (let i = 0; i < 4; i++) {
        setTimeout(() => audioManager.play('card_deal'), i * 150)
      }
    }

    // Hit or double down — player hand grew during playing phase
    if (
      state.phase === 'playing' &&
      prev.phase === 'playing' &&
      state.playerHand.length > prev.playerHand.length
    ) {
      audioManager.play('card_deal')
    }

    // Dealer draws during dealer turn
    if (
      state.phase === 'dealerTurn' &&
      prev.phase === 'dealerTurn' &&
      state.dealerHand.length > prev.dealerHand.length
    ) {
      audioManager.play('card_deal')
    }

    // Hole card reveal — phase changed from playing to dealerTurn
    if (prev.phase === 'playing' && state.phase === 'dealerTurn') {
      audioManager.play('card_flip')
    }

    // Result sounds
    if (state.result && !prev.result) {
      if (state.result === 'blackjack') {
        audioManager.play('blackjack')
      } else if (state.result === 'win' || state.result === 'dealerBust') {
        audioManager.play('win')
      } else if (state.result === 'bust') {
        audioManager.play('bust')
      } else if (state.result === 'lose') {
        audioManager.play('lose')
      }
    }

    prevRef.current = state
  }, [state])
}
