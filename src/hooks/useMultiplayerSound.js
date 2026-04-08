import { useEffect, useRef } from 'react'
import audioManager from '../utils/audioManager'
import { useAudioInit } from './useAudioInit'
import { RESULTS } from '../constants/results'
import { usePrevious } from './usePrevious'

export function useMultiplayerSound(state) {
  const prevState = usePrevious(state)
  const timersRef = useRef([])

  useAudioInit()

  // Sync mute state
  useEffect(() => {
    audioManager.setMuted(state.muted)
  }, [state.muted])

  useEffect(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []

    const prev = prevState

    // Cards dealt — transition from betting to playing
    if (prev.phase === 'betting' && state.phase === 'playing') {
      // Count actual cards from state instead of estimating
      let totalCards = (state.dealerHand?.length || 0)
      for (const player of Object.values(state.playerStates)) {
        if (player.hands) {
          for (const hand of player.hands) {
            totalCards += hand.cards?.length || 0
          }
        }
      }
      // Fallback minimum to avoid zero sounds
      if (totalCards === 0) {
        totalCards = (Object.keys(state.playerStates).length + 1) * 2
      }
      for (let i = 0; i < totalCards; i++) {
        timersRef.current.push(setTimeout(() => audioManager.play('card_deal'), i * 120))
      }
    }

    // Player hit — any player's hand grew during playing phase
    if (state.phase === 'playing' && prev.phase === 'playing') {
      for (const [id, player] of Object.entries(state.playerStates)) {
        const prevPlayer = prev.playerStates[id]
        const currLen = player.hands?.[player.active_hand_index]?.cards?.length || 0
        const prevLen = prevPlayer?.hands?.[prevPlayer.active_hand_index]?.cards?.length || 0
        if (prevPlayer && currLen > prevLen) {
          audioManager.play('card_deal')
          break
        }
      }
    }

    // Dealer draws during dealer turn
    if (state.phase === 'dealerTurn' && prev.phase === 'dealerTurn') {
      if (state.dealerHand.length > prev.dealerHand.length) {
        audioManager.play('card_deal')
      }
    }

    // Hole card reveal — transition to dealer turn
    if (prev.phase === 'playing' && state.phase === 'dealerTurn') {
      audioManager.play('card_flip')
    }

    // Result sounds — based on local player's result
    if (state.phase === 'result' && prev.phase !== 'result') {
      const localPlayer = state.playerStates[state.playerId]
      if (localPlayer?.result) {
        const r = localPlayer.result
        if (r === RESULTS.BLACKJACK) audioManager.play('blackjack')
        else if (r === RESULTS.WIN || r === RESULTS.DEALER_BUST) audioManager.play('win')
        else if (r === RESULTS.BUST) audioManager.play('bust')
        else if (r === RESULTS.LOSE) audioManager.play('lose')
      }
    }

    return () => {
      timersRef.current.forEach(clearTimeout)
      timersRef.current = []
    }
  }, [prevState, state.phase, state.dealerHand, state.playerStates, state.playerId, state.muted])
}
