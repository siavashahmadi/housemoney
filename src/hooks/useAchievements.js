import { useEffect, useRef } from 'react'
import { unlockAchievement, loadAchievements } from '../reducer/actions'

const STORAGE_KEY = 'blackjack_achievements'

const ASSET_ACHIEVEMENT_MAP = {
  watch: 'bet_watch',
  car: 'bet_car',
  kidney: 'bet_kidney',
  house: 'bet_house',
  soul: 'bet_soul',
}

function checkAchievements(prevState, state) {
  const dominated = new Set(state.unlockedAchievements)
  const earned = []

  function grant(id) {
    if (!dominated.has(id)) {
      earned.push(id)
      dominated.add(id)
    }
  }

  const isWin = state.result === 'win' || state.result === 'dealerBust' || state.result === 'blackjack'
  const isLoss = state.result === 'lose' || state.result === 'bust'

  // Hands played milestones
  grant('first_hand')
  if (state.handsPlayed >= 50) grant('hands_50')
  if (state.handsPlayed >= 100) grant('hands_100')

  // Win/loss firsts
  if (isWin) grant('first_win')
  if (isLoss) grant('first_loss')

  // Bankroll milestones
  if (state.bankroll <= 0) grant('broke')
  if (state.bankroll < -50000) grant('deep_debt')
  if (state.bankroll < -1000000) grant('million_debt')

  // Comeback: win while previously in debt
  if (isWin && prevState.bankroll < 0) grant('comeback')

  // Streaks
  if (state.winStreak >= 5) grant('win_streak_5')
  if (state.winStreak >= 10) grant('win_streak_10')
  if (state.loseStreak >= 5) grant('lose_streak_5')
  if (state.loseStreak >= 10) grant('lose_streak_10')

  // Double down
  if (state.isDoubledDown && isWin) grant('double_down_win')
  if (state.isDoubledDown && isLoss) grant('double_down_loss')

  // Blackjack
  if (state.result === 'blackjack') grant('blackjack')

  // All-in
  if (state.isAllIn && isWin) grant('all_in_win')
  if (state.isAllIn && isLoss) grant('all_in_loss')

  // Asset betting — use prevState since RESOLVE_HAND clears bettedAssets
  for (const asset of prevState.bettedAssets) {
    const achievementId = ASSET_ACHIEVEMENT_MAP[asset.id]
    if (achievementId) grant(achievementId)
  }

  // Lose everything — all 6 assets are false after this hand
  const allAssetsLost = Object.values(state.ownedAssets).every(v => !v)
  if (allAssetsLost && prevState.bettedAssets.length > 0) grant('lose_everything')

  return earned
}

export function useAchievements(state, dispatch) {
  const prevStateRef = useRef(state)
  const loadedRef = useRef(false)

  // Effect 1: Load from localStorage on mount
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const ids = JSON.parse(saved)
        if (Array.isArray(ids) && ids.length > 0) {
          dispatch(loadAchievements(ids))
        }
      }
    } catch {
      // Corrupted localStorage, ignore
    }
  }, [dispatch])

  // Effect 2: Check achievements when handsPlayed increments
  useEffect(() => {
    if (state.handsPlayed === 0) return
    const prevState = prevStateRef.current
    if (state.handsPlayed <= prevState.handsPlayed) return

    const newIds = checkAchievements(prevState, state)
    for (const id of newIds) {
      dispatch(unlockAchievement(id))
    }
  }, [state.handsPlayed, dispatch])

  // Effect 3: Persist to localStorage when achievements change
  useEffect(() => {
    if (!loadedRef.current) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.unlockedAchievements))
    } catch {
      // localStorage full, ignore
    }
  }, [state.unlockedAchievements])

  // Effect 4: Clear localStorage on game reset
  useEffect(() => {
    const prevState = prevStateRef.current
    if (state.handsPlayed === 0 && prevState.handsPlayed > 0) {
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // ignore
      }
    }
  }, [state.handsPlayed])

  // Always update prevStateRef last
  useEffect(() => {
    prevStateRef.current = state
  })
}
