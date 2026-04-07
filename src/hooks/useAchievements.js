import { useEffect, useRef } from 'react'
import { isWinResult, isLossResult } from '../utils/cardUtils'
import { unlockAchievement, loadAchievements } from '../reducer/actions'
import { RESULTS } from '../constants/results'

const STORAGE_KEY = 'blackjack_achievements'

const ASSET_ACHIEVEMENT_MAP = {
  watch: 'bet_watch',
  jewelry: 'bet_jewelry',
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

  const isWin = isWinResult(state.result)
  const isLoss = isLossResult(state.result)

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

  // Net payout for mixed-result awareness (splits)
  const netPayout = state.playerHands?.reduce((sum, h) => sum + (h.payout || 0), 0) ?? 0
  const effectiveWin = isWin || (state.result === RESULTS.MIXED && netPayout > 0)
  const effectiveLoss = isLoss || (state.result === RESULTS.MIXED && netPayout < 0)

  // Comeback: win while previously in debt (net-positive mixed counts)
  if (effectiveWin && prevState.bankroll < 0) grant('comeback')

  // Streaks
  if (state.winStreak >= 5) grant('win_streak_5')
  if (state.winStreak >= 10) grant('win_streak_10')
  if (state.loseStreak >= 5) grant('lose_streak_5')
  if (state.loseStreak >= 10) grant('lose_streak_10')

  // Double down — check the specific doubled hand's result, not aggregate
  const doubledHandWon = state.playerHands?.some(h =>
    h.isDoubledDown && isWinResult(h.result)
  ) ?? false
  const doubledHandLost = state.playerHands?.some(h =>
    h.isDoubledDown && isLossResult(h.result)
  ) ?? false
  if (doubledHandWon) grant('double_down_win')
  if (doubledHandLost) grant('double_down_loss')

  // Blackjack
  if (state.result === RESULTS.BLACKJACK) grant('blackjack')

  // All-in (net-positive mixed counts as win, net-negative as loss)
  if (state.isAllIn && effectiveWin) grant('all_in_win')
  if (state.isAllIn && effectiveLoss) grant('all_in_loss')

  // Asset betting — use prevState since RESOLVE_HAND clears bettedAssets
  for (const asset of prevState.bettedAssets) {
    const achievementId = ASSET_ACHIEVEMENT_MAP[asset.id]
    if (achievementId) grant(achievementId)
  }

  // Lose everything — all 6 assets are false after this hand
  const allAssetsLost = Object.values(state.ownedAssets).every(v => !v)
  if (allAssetsLost && prevState.bettedAssets.length > 0) grant('lose_everything')

  // Split achievements
  if (state.playerHands && state.playerHands.length > 1) {
    grant('first_split')
    if (state.playerHands.length >= 4) grant('split_four')
    const allWin = state.playerHands.every(h => isWinResult(h.result))
    if (allWin) grant('split_both_win')
    const allBust = state.playerHands.every(h => h.result === RESULTS.BUST)
    if (allBust) grant('split_both_bust')
  }

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
  }, [state, dispatch])

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

  // Effect 5: Debt mode achievement — triggers on TAKE_LOAN (not on hands played)
  useEffect(() => {
    const prevState = prevStateRef.current
    if (state.inDebtMode && !prevState.inDebtMode) {
      if (!state.unlockedAchievements.includes('point_of_no_return')) {
        dispatch(unlockAchievement('point_of_no_return'))
      }
    }
  }, [state.inDebtMode, state.unlockedAchievements, dispatch])

  // Always update prevStateRef last
  useEffect(() => {
    prevStateRef.current = state
  })
}
