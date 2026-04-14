import { useReducer, useRef, useCallback, useEffect } from 'react'
import { slotsReducer } from '../../reducer/slotsReducer'
import { createSlotsInitialState } from '../../reducer/slotsInitialState'
import { generateSpin } from '../../utils/slotUtils'
import { formatMoney } from '../../utils/formatters'
import {
  slotsSetBet, slotsReelStop, slotsResolve, slotsReset,
  slotsSpin, SLOTS_NEW_ROUND, SLOTS_TOGGLE_MUTE,
} from '../../reducer/slotsActions'
import { useSlotsSound } from '../../hooks/useSlotsSound'
import Header from '../Header'
import BankrollDisplay from '../BankrollDisplay'
import SlotMachine from './SlotMachine'
import SlotsBetSelector from './SlotsBetSelector'
import SlotsResultBanner from './SlotsResultBanner'
import styles from './SoloSlots.module.css'

function SoloSlots({ onBack }) {
  const [state, dispatch] = useReducer(slotsReducer, null, createSlotsInitialState)
  const stateRef = useRef(state)
  stateRef.current = state // eslint-disable-line react-hooks/refs

  useSlotsSound(state)

  // Auto-resolve when all reels have stopped
  useEffect(() => {
    if (state.phase === 'spinning' && state.reelStops.every(Boolean)) {
      dispatch(slotsResolve())
    }
  }, [state.phase, state.reelStops])

  const handleSpin = useCallback(() => {
    const reels = generateSpin(Math.random(), Math.random(), Math.random())
    dispatch(slotsSpin(reels))
  }, [])

  const handleSetBet = useCallback((amount) => dispatch(slotsSetBet(amount)), [])

  const handleMaxBet = useCallback(() => {
    dispatch(slotsSetBet(stateRef.current.bankroll))
  }, [])

  const handleSpinAgain = useCallback(() => {
    dispatch({ type: SLOTS_NEW_ROUND })
    const reels = generateSpin(Math.random(), Math.random(), Math.random())
    dispatch(slotsSpin(reels))
  }, [])

  const handleChangeBet = useCallback(() => dispatch({ type: SLOTS_NEW_ROUND }), [])

  const handleReset = useCallback(() => dispatch(slotsReset()), [])

  const handleToggleMute = useCallback(() => dispatch({ type: SLOTS_TOGGLE_MUTE }), [])

  const handleBack = useCallback(() => {
    if (stateRef.current.spinsPlayed > 0) {
      if (!window.confirm('Return to menu? Current progress will be lost.')) return
    }
    onBack()
  }, [onBack])

  const handleResetConfirm = useCallback(() => {
    if (stateRef.current.spinsPlayed > 0) {
      if (!window.confirm('Start a new game? Current progress will be lost.')) return
    }
    dispatch(slotsReset())
  }, [])

  const handleReelStop = useCallback((index) => {
    dispatch(slotsReelStop(index))
  }, [])

  const isSpinning = state.phase === 'spinning'
  const showMatchLabel = state.phase === 'result' ? state.matchType : null

  return (
    <div className={styles.soloSlots}>
      <Header
        bankroll={state.bankroll}
        onReset={handleResetConfirm}
        muted={state.muted}
        onToggleMute={handleToggleMute}
        onBack={handleBack}
      />
      <BankrollDisplay
        bankroll={state.bankroll}
        currentBetTotal={state.betAmount}
        handsPlayed={state.spinsPlayed}
      />

      <div className={styles.table}>
        <SlotMachine
          reels={state.reels}
          spinning={isSpinning}
          matchType={showMatchLabel}
          onReelStop={handleReelStop}
        />
        <div className={styles.betDisplay}>
          {state.phase !== 'result'
            ? `Bet: ${formatMoney(state.betAmount)}`
            : '\u00A0'}
        </div>
      </div>

      <div className={styles.controlsArea}>
        <div className={styles.phaseContent}>
          {state.phase === 'betting' && (
            <SlotsBetSelector
              betAmount={state.betAmount}
              bankroll={state.bankroll}
              onSetBet={handleSetBet}
              onSpin={handleSpin}
              onMaxBet={handleMaxBet}
            />
          )}
          {state.phase === 'result' && (
            <SlotsResultBanner
              matchType={state.matchType}
              multiplier={state.multiplier}
              payout={state.payout}
              betAmount={state.betAmount}
              bankroll={state.bankroll}
              onSpinAgain={handleSpinAgain}
              onChangeBet={handleChangeBet}
              onReset={handleReset}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default SoloSlots
