import { useReducer, useRef } from 'react'
import { gameReducer } from './reducer/gameReducer'
import { createInitialState } from './reducer/initialState'
import {
  addChip, selectChip, deal, hit, doubleDown, betAsset, removeAsset,
  UNDO_CHIP, CLEAR_CHIPS, ALL_IN, STAND, NEW_ROUND, RESET_GAME,
  TOGGLE_ASSET_MENU, DISMISS_LOAN_SHARK, TOGGLE_ACHIEVEMENTS, DISMISS_ACHIEVEMENT,
} from './reducer/actions'
import { useDealerTurn } from './hooks/useDealerTurn'
import { useDealerMessage } from './hooks/useDealerMessage'
import { useLoanShark } from './hooks/useLoanShark'
import { useAchievements } from './hooks/useAchievements'
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

  // Draw cards from deck (component picks, reducer processes)
  const drawCards = (count) => stateRef.current.deck.slice(0, count)

  // --- Handlers ---
  const handleChipTap = (value) => {
    dispatch(selectChip(value))
    dispatch(addChip(value))
  }

  const handleUndo = () => dispatch({ type: UNDO_CHIP })
  const handleClear = () => dispatch({ type: CLEAR_CHIPS })
  const handleAllIn = () => dispatch({ type: ALL_IN })

  const handleDeal = () => {
    const cards = drawCards(4)
    dispatch(deal(cards))
  }

  const handleHit = () => {
    const [card] = drawCards(1)
    dispatch(hit(card))
  }

  const handleStand = () => dispatch({ type: STAND })

  const handleDoubleDown = () => {
    const [card] = drawCards(1)
    dispatch(doubleDown(card))
  }

  const handleNewRound = () => dispatch({ type: NEW_ROUND })
  const handleReset = () => dispatch({ type: RESET_GAME })

  const handleBetAsset = (asset) => dispatch(betAsset(asset))
  const handleRemoveAsset = (assetId) => dispatch(removeAsset(assetId))
  const handleToggleAssetMenu = () => dispatch({ type: TOGGLE_ASSET_MENU })
  const handleDismissLoanShark = () => dispatch({ type: DISMISS_LOAN_SHARK })
  const handleToggleAchievements = () => dispatch({ type: TOGGLE_ACHIEVEMENTS })
  const handleDismissAchievement = () => dispatch({ type: DISMISS_ACHIEVEMENT })

  // --- Derived state ---
  const canDoubleDown =
    state.phase === 'playing' &&
    state.playerHand.length === 2 &&
    !state.isDoubledDown

  const hideHoleCard = state.phase === 'playing'

  return (
    <div className={styles.app}>
      <Header
        bankroll={state.bankroll}
        onReset={handleReset}
        unlockedCount={state.unlockedAchievements.length}
        onToggleAchievements={handleToggleAchievements}
      />
      <BankrollDisplay bankroll={state.bankroll} />

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
