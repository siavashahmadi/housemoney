import { useEffect, useRef } from 'react'
import { TOGGLE_MUTE, TOGGLE_NOTIFICATIONS, TOGGLE_ACHIEVEMENTS_ENABLED, TOGGLE_DD_FACE_DOWN, loadHighestDebt } from '../reducer/actions'

const KEYS = {
  MUTED: 'housemoney_muted',
  HIGHEST_DEBT: 'housemoney_highest_debt',
  NOTIFICATIONS: 'housemoney_notifications',
  ACHIEVEMENTS_ENABLED: 'housemoney_achievements_enabled',
  DD_FACE_DOWN: 'housemoney_dd_face_down',
}

export function useSessionPersistence(state, dispatch) {
  const loadedRef = useRef(false)

  // Load persisted values on mount
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    try {
      const savedMuted = localStorage.getItem(KEYS.MUTED)
      if (savedMuted === 'true' && !state.muted) {
        dispatch({ type: TOGGLE_MUTE })
      }

      const savedNotifications = localStorage.getItem(KEYS.NOTIFICATIONS)
      if (savedNotifications === 'false' && state.notificationsEnabled) {
        dispatch({ type: TOGGLE_NOTIFICATIONS })
      }

      const savedAchievementsEnabled = localStorage.getItem(KEYS.ACHIEVEMENTS_ENABLED)
      if (savedAchievementsEnabled === 'false' && state.achievementsEnabled) {
        dispatch({ type: TOGGLE_ACHIEVEMENTS_ENABLED })
      }

      const savedDdFaceDown = localStorage.getItem(KEYS.DD_FACE_DOWN)
      if (savedDdFaceDown === 'true' && !state.ddCardFaceDown) {
        dispatch({ type: TOGGLE_DD_FACE_DOWN })
      }

      const savedDebt = localStorage.getItem(KEYS.HIGHEST_DEBT)
      if (savedDebt) {
        const value = Number(savedDebt)
        if (Number.isFinite(value)) {
          dispatch(loadHighestDebt(value))
        }
      }
    } catch {
      // Corrupted localStorage, ignore
    }
  }, [dispatch]) // eslint-disable-line react-hooks/exhaustive-deps -- intentionally runs once on mount

  // Persist mute preference
  useEffect(() => {
    if (!loadedRef.current) return
    try {
      localStorage.setItem(KEYS.MUTED, String(state.muted))
    } catch {
      // localStorage full, ignore
    }
  }, [state.muted])

  // Persist notification preference
  useEffect(() => {
    if (!loadedRef.current) return
    try {
      localStorage.setItem(KEYS.NOTIFICATIONS, String(state.notificationsEnabled))
    } catch {
      // localStorage full, ignore
    }
  }, [state.notificationsEnabled])

  // Persist achievements enabled preference
  useEffect(() => {
    if (!loadedRef.current) return
    try {
      localStorage.setItem(KEYS.ACHIEVEMENTS_ENABLED, String(state.achievementsEnabled))
    } catch {
      // localStorage full, ignore
    }
  }, [state.achievementsEnabled])

  // Persist DD face down preference
  useEffect(() => {
    if (!loadedRef.current) return
    try {
      localStorage.setItem(KEYS.DD_FACE_DOWN, String(state.ddCardFaceDown))
    } catch {
      // localStorage full, ignore
    }
  }, [state.ddCardFaceDown])

  // Persist highest debt (lowest bankroll)
  useEffect(() => {
    if (!loadedRef.current) return
    try {
      const stored = localStorage.getItem(KEYS.HIGHEST_DEBT)
      const current = state.lowestBankroll
      if (!stored || current < Number(stored)) {
        localStorage.setItem(KEYS.HIGHEST_DEBT, String(current))
      }
    } catch {
      // localStorage full, ignore
    }
  }, [state.lowestBankroll])
}
