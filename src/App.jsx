import { useReducer, useRef, useCallback, useMemo } from 'react'
import audioManager from './utils/audioManager'
import { gameReducer } from './reducer/gameReducer'
import { createInitialState } from './reducer/initialState'
import {
  addChip, selectChip, deal, hit, doubleDown, betAsset, removeAsset,
  UNDO_CHIP, CLEAR_CHIPS, ALL_IN, STAND, NEW_ROUND, RESET_GAME,
  TOGGLE_ASSET_MENU, DISMISS_LOAN_SHARK, TOGGLE_ACHIEVEMENTS, DISMISS_ACHIEVEMENT,
  TOGGLE_MUTE,
} from './reducer/actions'
import { useDealerTurn } from './hooks/useDealerTurn'
import { useDealerMessage } from './hooks/useDealerMessage'
import { useLoanShark } from './hooks/useLoanShark'
import { useAchievements } from './hooks/useAchievements'
import { useSound } from './hooks/useSound'
import { useSessionPersistence } from './hooks/useSessionPersistence'
import Header from './components/Header'
import BankrollDisplay from './components/BankrollDisplay'
import DealerArea from './components/DealerArea'
import PlayerArea from './components/PlayerArea'
import BettingCircle from './components/BettingCircle'
import BettingControls from './components/BettingControls'
import ActionButtons from './components/ActionButtons'
import ResultBanner from './components/ResultBanner'
import LoanSharkPopup from './components/LoanSharkPopup'
import AchievementToast from './components/AchievementToast'
import AchievementPanel from './components/AchievementPanel'
import styles from './App.module.css'

function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState)
  const stateRef = useRef(state)
  stateRef.current = state

  // Dealer turn automation
  useDealerTurn(state, dispatch)
  useDealerMessage(state, dispatch)
  useLoanShark(state, dispatch)
  useAchievements(state, dispatch)
  useSound(state)
  useSessionPersistence(state, dispatch)

  // --- Handlers (stable via useCallback — dispatch and stateRef never change identity) ---
  const handleChipTap = useCallback((value) => {
    // Play sound immediately on tap — not in useEffect — for zero-latency feedback
    const isFirst = stateRef.current.chipStack.length === 0
    audioManager.play(isFirst ? 'chip_place' : 'chip_stack')
    dispatch(selectChip(value))
    dispatch(addChip(value))
  }, [])

  const handleUndo = useCallback(() => dispatch({ type: UNDO_CHIP }), [])
  const handleClear = useCallback(() => dispatch({ type: CLEAR_CHIPS }), [])
  const handleAllIn = useCallback(() => dispatch({ type: ALL_IN }), [])

  const handleDeal = useCallback(() => {
    const cards = stateRef.current.deck.slice(0, 4)
    dispatch(deal(cards))
  }, [])

  const handleHit = useCallback(() => {
    const [card] = stateRef.current.deck.slice(0, 1)
    dispatch(hit(card))
  }, [])

  const handleStand = useCallback(() => dispatch({ type: STAND }), [])

  const handleDoubleDown = useCallback(() => {
    const [card] = stateRef.current.deck.slice(0, 1)
    dispatch(doubleDown(card))
  }, [])

  const handleNewRound = useCallback(() => dispatch({ type: NEW_ROUND }), [])
  const handleReset = useCallback(() => dispatch({ type: RESET_GAME }), [])

  const handleBetAsset = useCallback((asset) => dispatch(betAsset(asset)), [])
  const handleRemoveAsset = useCallback((assetId) => dispatch(removeAsset(assetId)), [])
  const handleToggleAssetMenu = useCallback(() => dispatch({ type: TOGGLE_ASSET_MENU }), [])
  const handleDismissLoanShark = useCallback(() => dispatch({ type: DISMISS_LOAN_SHARK }), [])
  const handleToggleAchievements = useCallback(() => dispatch({ type: TOGGLE_ACHIEVEMENTS }), [])
  const handleDismissAchievement = useCallback(() => dispatch({ type: DISMISS_ACHIEVEMENT }), [])
  const handleToggleMute = useCallback(() => dispatch({ type: TOGGLE_MUTE }), [])

  // --- Derived state ---
  const currentBetTotal = useMemo(() =>
    state.chipStack.reduce((sum, v) => sum + v, 0),
    [state.chipStack]
  )

  const canDoubleDown = useMemo(() =>
    state.phase === 'playing' &&
    state.playerHand.length === 2 &&
    !state.isDoubledDown,
    [state.phase, state.playerHand.length, state.isDoubledDown]
  )

  const hideHoleCard = state.phase === 'playing'

  return (
    <div className={styles.app}>
      <Header
        bankroll={state.bankroll}
        onReset={handleReset}
        unlockedCount={state.unlockedAchievements.length}
        onToggleAchievements={handleToggleAchievements}
        muted={state.muted}
        onToggleMute={handleToggleMute}
      />
      <BankrollDisplay bankroll={state.bankroll} currentBetTotal={currentBetTotal} />

      <div className={styles.table}>
        <DealerArea
          hand={state.dealerHand}
          phase={state.phase}
          hideHoleCard={hideHoleCard}
          dealerMessage={state.dealerMessage}
        />
        <BettingCircle
          chipStack={state.chipStack}
          bettedAssets={state.bettedAssets}
          onUndo={handleUndo}
          onRemoveAsset={handleRemoveAsset}
        />
        <PlayerArea hand={state.playerHand} />
      </div>

      <div className={styles.controlsArea}>
        {state.phase === 'betting' && (
          <BettingControls
            bankroll={state.bankroll}
            selectedChipValue={state.selectedChipValue}
            chipStack={state.chipStack}
            ownedAssets={state.ownedAssets}
            bettedAssets={state.bettedAssets}
            showAssetMenu={state.showAssetMenu}
            onChipTap={handleChipTap}
            onUndo={handleUndo}
            onClear={handleClear}
            onAllIn={handleAllIn}
            onDeal={handleDeal}
            onBetAsset={handleBetAsset}
            onToggleAssetMenu={handleToggleAssetMenu}
          />
        )}
        {state.phase === 'playing' && (
          <ActionButtons
            onHit={handleHit}
            onStand={handleStand}
            onDoubleDown={handleDoubleDown}
            canDoubleDown={canDoubleDown}
          />
        )}
        {state.phase === 'dealerTurn' && (
          <div className={styles.waitingMessage}>Dealer&apos;s turn...</div>
        )}
        {state.phase === 'result' && (
          <ResultBanner
            result={state.result}
            bankroll={state.bankroll}
            onNextHand={handleNewRound}
          />
        )}
      </div>

      <LoanSharkPopup
        message={state.loanSharkQueue[0] || null}
        onDismiss={handleDismissLoanShark}
      />

      {state.achievementQueue.length > 0 && (
        <AchievementToast
          key={state.achievementQueue[0]}
          achievementId={state.achievementQueue[0]}
          onDismiss={handleDismissAchievement}
        />
      )}

      {state.showAchievements && (
        <AchievementPanel
          unlockedAchievements={state.unlockedAchievements}
          onClose={handleToggleAchievements}
        />
      )}
    </div>
  )
}

export default App
