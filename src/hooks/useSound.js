import { useEffect, useRef } from 'react'
import audioManager from '../utils/audioManager'
import { useAudioInit } from './useAudioInit'
import { RESULTS } from '../constants/results'

export function useSound(state) {
  const prevRef = useRef(state)

  useAudioInit()

  // Sync mute state
  useEffect(() => {
    audioManager.setMuted(state.muted)
  }, [state.muted])

  // Detect mid-round reshuffle (deck size jumps by >200)
  const prevDeckLenRef = useRef(state.deck?.length ?? 0)
  useEffect(() => {
    const prevLen = prevDeckLenRef.current
    const curLen = state.deck?.length ?? 0
    if (prevLen > 0 && curLen - prevLen > 200) {
      audioManager.play('shuffle')
    }
    prevDeckLenRef.current = curLen
  }, [state.deck?.length])

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

    // Hit or double down — player hand cards grew during playing phase
    const totalCards = state.playerHands?.reduce((sum, h) => sum + h.cards.length, 0) ?? 0
    const prevTotalCards = prev.playerHands?.reduce((sum, h) => sum + h.cards.length, 0) ?? 0
    if (
      state.phase === 'playing' &&
      prev.phase === 'playing' &&
      totalCards > prevTotalCards
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
      if (state.result === RESULTS.BLACKJACK) {
        audioManager.play('blackjack')
      } else if (state.result === RESULTS.WIN || state.result === RESULTS.DEALER_BUST) {
        audioManager.play('win')
      } else if (state.result === RESULTS.BUST) {
        audioManager.play('bust')
      } else if (state.result === RESULTS.LOSE) {
        audioManager.play('lose')
      } else if (state.result === RESULTS.MIXED) {
        audioManager.play('win')
      } else if (state.result === RESULTS.PUSH) {
        audioManager.play('card_flip')
      }
    }

    prevRef.current = state
  }, [state.phase, state.result, state.playerHands, state.dealerHand])
}
