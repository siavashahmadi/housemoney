import { useReducer, useRef, useCallback, useMemo, useState } from 'react'
import audioManager from '../utils/audioManager'
import { gameReducer } from '../reducer/gameReducer'
import { createInitialState } from '../reducer/initialState'
import { createDeck, shuffle } from '../utils/cardUtils'
import {
  addChip, selectChip, deal, hit, doubleDown, betAsset, removeAsset,
  newRound, resetGame,
  UNDO_CHIP, CLEAR_CHIPS, ALL_IN, STAND,
  TOGGLE_ASSET_MENU, DISMISS_LOAN_SHARK, TOGGLE_ACHIEVEMENTS, DISMISS_ACHIEVEMENT,
  TOGGLE_MUTE, TOGGLE_NOTIFICATIONS,
} from '../reducer/actions'
import { useDealerTurn } from '../hooks/useDealerTurn'
import { useDealerMessage } from '../hooks/useDealerMessage'
import { useLoanShark } from '../hooks/useLoanShark'
import { useAchievements } from '../hooks/useAchievements'
import { useSound } from '../hooks/useSound'
import { useSessionPersistence } from '../hooks/useSessionPersistence'
import Header from './Header'
import BankrollDisplay from './BankrollDisplay'
import DealerArea from './DealerArea'
import PlayerArea from './PlayerArea'
import BettingCircle from './BettingCircle'
import BettingControls from './BettingControls'
import ActionButtons from './ActionButtons'
import ResultBanner from './ResultBanner'
import LoanSharkPopup from './LoanSharkPopup'
import AchievementToast from './AchievementToast'
import AchievementPanel from './AchievementPanel'
import FlyingChip from './FlyingChip'
import styles from './SoloGame.module.css'

let flyingChipId = 0

function SoloGame({ onBack }) {
  const [state, dispatch] = useReducer(gameReducer, null, () => ({
    ...createInitialState(),
    deck: shuffle(createDeck()),
  }))
  const stateRef = useRef(state)
  stateRef.current = state

  // Flying chip animations (purely visual — fire and forget)
  const [flyingChips, setFlyingChips] = useState([])
  const circleRef = useRef(null)

  // Dealer turn automation
  useDealerTurn(state, dispatch)
  useDealerMessage(state, dispatch)
  useLoanShark(state, dispatch)
  useAchievements(state, dispatch)
  useSound(state)
  useSessionPersistence(state, dispatch)

  // --- Handlers (stable via useCallback — dispatch and stateRef never change identity) ---
  const handleChipTap = useCallback((value, event) => {
    // Haptic + sound immediately on tap for zero-latency feedback
    navigator.vibrate?.(10)
    const isFirst = stateRef.current.chipStack.length === 0
    audioManager.play(isFirst ? 'chip_place' : 'chip_stack')
    dispatch(selectChip(value))
    dispatch(addChip(value))

    // Spawn flying chip animation (visual only)
    if (event?.target && circleRef.current) {
      const from = event.target.getBoundingClientRect()
      const to = circleRef.current.getBoundingClientRect()
      const id = ++flyingChipId
      setFlyingChips(prev => [...prev, {
        id,
        value,
        from: { x: from.left + from.width / 2 - 18, y: from.top + from.height / 2 - 18 },
        to: { x: to.left + to.width / 2 - 18, y: to.top + to.height / 2 - 18 },
      }])
    }
  }, [])

  const handleUndo = useCallback((event) => {
    const chipStack = stateRef.current.chipStack
    if (chipStack.length === 0) return
    const removedValue = chipStack[chipStack.length - 1]

    dispatch({ type: UNDO_CHIP })

    // Spawn flying chip from circle to tray (visual only — reverse animation)
    if (circleRef.current) {
      const circleRect = circleRef.current.getBoundingClientRect()
      const from = { x: circleRect.left + circleRect.width / 2 - 18, y: circleRect.top + circleRect.height / 2 - 18 }
      // Target: approximate tray center (below the circle)
      const to = { x: from.x, y: from.y + 200 }
      const id = ++flyingChipId
      setFlyingChips(prev => [...prev, {
        id,
        value: removedValue,
        from,
        to,
        reverse: true,
      }])
    }
  }, [])

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

  const handleNewRound = useCallback(() => dispatch(newRound(shuffle(createDeck()))), [])
  const handleReset = useCallback(() => dispatch(resetGame(shuffle(createDeck()))), [])

  // Asset betting with confirmation for high-value assets
  const [pendingAssetConfirm, setPendingAssetConfirm] = useState(null)

  const handleBetAsset = useCallback((asset) => {
    // House and soul require confirmation
    if (asset.id === 'house' || asset.id === 'soul') {
      setPendingAssetConfirm(asset)
    } else {
      dispatch(betAsset(asset))
    }
  }, [])

  const handleConfirmAsset = useCallback(() => {
    if (pendingAssetConfirm) {
      dispatch(betAsset(pendingAssetConfirm))
      setPendingAssetConfirm(null)
    }
  }, [pendingAssetConfirm])

  const handleCancelAsset = useCallback(() => setPendingAssetConfirm(null), [])

  const handleRemoveAsset = useCallback((assetId) => dispatch(removeAsset(assetId)), [])
  const handleToggleAssetMenu = useCallback(() => dispatch({ type: TOGGLE_ASSET_MENU }), [])
  const handleDismissLoanShark = useCallback(() => dispatch({ type: DISMISS_LOAN_SHARK }), [])
  const handleToggleAchievements = useCallback(() => dispatch({ type: TOGGLE_ACHIEVEMENTS }), [])
  const handleDismissAchievement = useCallback(() => dispatch({ type: DISMISS_ACHIEVEMENT }), [])
  const handleToggleMute = useCallback(() => dispatch({ type: TOGGLE_MUTE }), [])
  const handleToggleNotifications = useCallback(() => dispatch({ type: TOGGLE_NOTIFICATIONS }), [])

  const removeFlyingChip = useCallback((id) => {
    setFlyingChips(prev => prev.filter(c => c.id !== id))
  }, [])

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
    <div className={styles.soloGame}>
      <Header
        bankroll={state.bankroll}
        onReset={handleReset}
        unlockedCount={state.unlockedAchievements.length}
        onToggleAchievements={handleToggleAchievements}
        muted={state.muted}
        onToggleMute={handleToggleMute}
        notificationsEnabled={state.notificationsEnabled}
        onToggleNotifications={handleToggleNotifications}
        onBack={onBack}
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
          ref={circleRef}
          chipStack={state.chipStack}
          bettedAssets={state.bettedAssets}
          result={state.result}
          onUndo={handleUndo}
          onRemoveAsset={handleRemoveAsset}
        />
        <PlayerArea hand={state.playerHand} />
      </div>

      <div className={styles.controlsArea}>
        <div key={state.phase} className={styles.phaseContent}>
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
      </div>

      {/* Flying chip animations */}
      {flyingChips.map(chip => (
        <FlyingChip
          key={chip.id}
          value={chip.value}
          from={chip.from}
          to={chip.to}
          reverse={chip.reverse}
          onDone={() => removeFlyingChip(chip.id)}
        />
      ))}

      {/* Asset confirmation modal */}
      {pendingAssetConfirm && (
        <div className={styles.confirmOverlay} onClick={handleCancelAsset}>
          <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <span className={styles.confirmEmoji}>{pendingAssetConfirm.emoji}</span>
            <span className={styles.confirmName}>{pendingAssetConfirm.name}</span>
            <span className={styles.confirmValue}>
              ${pendingAssetConfirm.value.toLocaleString()}
            </span>
            <div className={styles.confirmButtons}>
              <button className={styles.confirmBet} onClick={handleConfirmAsset}>
                BET IT
              </button>
              <button className={styles.confirmCancel} onClick={handleCancelAsset}>
                NEVERMIND
              </button>
            </div>
          </div>
        </div>
      )}

      {state.notificationsEnabled && (
        <LoanSharkPopup
          message={state.loanSharkQueue[0] || null}
          onDismiss={handleDismissLoanShark}
        />
      )}

      {state.notificationsEnabled && state.achievementQueue.length > 0 && (
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

export default SoloGame
