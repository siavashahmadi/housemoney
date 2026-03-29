import { useReducer, useRef, useCallback, useMemo, useState, useEffect } from 'react'
import audioManager from '../utils/audioManager'
import { gameReducer } from '../reducer/gameReducer'
import { createInitialState } from '../reducer/initialState'
import { createDeck, shuffle } from '../utils/cardUtils'
import { TABLE_LEVELS } from '../constants/tableLevels'
import {
  addChip, selectChip, deal, hit, doubleDown, split, betAsset, removeAsset,
  takeLoan, newRound, resetGame,
  UNDO_CHIP, CLEAR_CHIPS, ALL_IN, STAND,
  TOGGLE_ASSET_MENU, DISMISS_LOAN_SHARK, TOGGLE_ACHIEVEMENTS, DISMISS_ACHIEVEMENT,
  TOGGLE_MUTE, TOGGLE_NOTIFICATIONS, TOGGLE_DEBT_TRACKER, DISMISS_TABLE_TOAST,
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
import DebtTracker from './DebtTracker'
import TableLevelToast from './TableLevelToast'
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

  // Set felt color via data-table attribute on <html>
  useEffect(() => {
    const tableId = TABLE_LEVELS[state.tableLevel].id
    document.documentElement.dataset.table = tableId
    return () => delete document.documentElement.dataset.table
  }, [state.tableLevel])

  const handleDismissTableToast = useCallback(() => {
    dispatch({ type: DISMISS_TABLE_TOAST })
  }, [])

  // --- Handlers (stable via useCallback — dispatch and stateRef never change identity) ---
  const handleChipTap = useCallback((value, event) => {
    const s = stateRef.current
    if (s.phase !== 'betting') return
    const tapMinBet = TABLE_LEVELS[s.tableLevel].minBet
    if (s.bankroll < tapMinBet && !s.inDebtMode) return
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
    if (stateRef.current.deck.length < 4) {
      const freshDeck = shuffle(createDeck())
      dispatch(deal(freshDeck.slice(0, 4), freshDeck.slice(4)))
    } else {
      dispatch(deal(stateRef.current.deck.slice(0, 4)))
    }
  }, [])

  const handleHit = useCallback(() => {
    if (stateRef.current.deck.length < 1) {
      dispatch(hit(null, shuffle(createDeck())))
    } else {
      const [card] = stateRef.current.deck.slice(0, 1)
      dispatch(hit(card))
    }
  }, [])

  const handleStand = useCallback(() => dispatch({ type: STAND }), [])

  // Loan confirmation for split/double when player can't afford it
  const [pendingLoanAction, setPendingLoanAction] = useState(null)

  const handleDoubleDown = useCallback(() => {
    const s = stateRef.current
    const hand = s.playerHands[s.activeHandIndex]
    if (hand && s.bankroll - hand.bet < 0 && !s.inDebtMode) {
      setPendingLoanAction({ type: 'double' })
      return
    }
    if (s.deck.length < 1) {
      dispatch(doubleDown(null, shuffle(createDeck())))
    } else {
      const [card] = s.deck.slice(0, 1)
      dispatch(doubleDown(card))
    }
  }, [])

  const handleSplit = useCallback(() => {
    const s = stateRef.current
    const hand = s.playerHands[s.activeHandIndex]
    if (hand && s.bankroll - hand.bet < 0 && !s.inDebtMode) {
      setPendingLoanAction({ type: 'split' })
      return
    }
    if (s.deck.length < 2) {
      dispatch(split(null, shuffle(createDeck())))
    } else {
      const cards = s.deck.slice(0, 2)
      dispatch(split(cards))
    }
  }, [])

  const handleConfirmLoan = useCallback(() => {
    // Snapshot deck before any dispatch — stateRef won't update until re-render
    const deck = stateRef.current.deck
    dispatch(takeLoan())
    // useReducer processes dispatches sequentially — inDebtMode is true for the next action
    if (pendingLoanAction?.type === 'double') {
      if (deck.length < 1) {
        dispatch(doubleDown(null, shuffle(createDeck())))
      } else {
        dispatch(doubleDown(deck[0]))
      }
    } else if (pendingLoanAction?.type === 'split') {
      if (deck.length < 2) {
        dispatch(split(null, shuffle(createDeck())))
      } else {
        dispatch(split(deck.slice(0, 2)))
      }
    }
    setPendingLoanAction(null)
  }, [pendingLoanAction])

  const handleCancelLoan = useCallback(() => setPendingLoanAction(null), [])

  const handleNewRound = useCallback(() => dispatch(newRound(shuffle(createDeck()))), [])
  const handleReset = useCallback(() => {
    if (stateRef.current.handsPlayed > 0) {
      if (!window.confirm('Start a new game? Current progress will be lost.')) return
    }
    dispatch(resetGame(shuffle(createDeck())))
  }, [])
  const handleBack = useCallback(() => {
    if (stateRef.current.handsPlayed > 0) {
      if (!window.confirm('Return to menu? Current progress will be lost.')) return
    }
    onBack()
  }, [onBack])

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
  const handleTakeLoan = useCallback(() => dispatch(takeLoan()), [])
  const handleDismissLoanShark = useCallback(() => dispatch({ type: DISMISS_LOAN_SHARK }), [])
  const handleToggleAchievements = useCallback(() => dispatch({ type: TOGGLE_ACHIEVEMENTS }), [])
  const handleToggleDebtTracker = useCallback(() => dispatch({ type: TOGGLE_DEBT_TRACKER }), [])
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

  const currentActiveHand = state.playerHands[state.activeHandIndex]

  const canDoubleDown = useMemo(() => {
    if (state.phase !== 'playing' || !currentActiveHand) return false
    if (currentActiveHand.isSplitAces) return false
    return currentActiveHand.cards.length === 2 && !currentActiveHand.isDoubledDown
  }, [state.phase, currentActiveHand])

  const canSplit = useMemo(() => {
    if (state.phase !== 'playing' || !currentActiveHand) return false
    if (currentActiveHand.cards.length !== 2) return false
    if (currentActiveHand.isSplitAces) return false
    if (state.playerHands.length >= 4) return false
    return currentActiveHand.cards[0].rank === currentActiveHand.cards[1].rank
  }, [state.phase, currentActiveHand, state.playerHands.length])

  const hideHoleCard = state.phase === 'playing'

  return (
    <div className={styles.soloGame}>
      <Header
        bankroll={state.bankroll}
        tableLevel={state.tableLevel}
        onReset={handleReset}
        unlockedCount={state.unlockedAchievements.length}
        onToggleAchievements={handleToggleAchievements}
        onToggleDebtTracker={handleToggleDebtTracker}
        muted={state.muted}
        onToggleMute={handleToggleMute}
        notificationsEnabled={state.notificationsEnabled}
        onToggleNotifications={handleToggleNotifications}
        onBack={handleBack}
      />
      <BankrollDisplay
        bankroll={state.bankroll}
        currentBetTotal={currentBetTotal}
        handsPlayed={state.handsPlayed}
        vigAmount={state.vigAmount}
        vigRate={state.vigRate}
      />

      <div className={styles.table}>
        <DealerArea
          hand={state.dealerHand}
          phase={state.phase}
          hideHoleCard={hideHoleCard}
          dealerMessage={state.dealerMessage}
          deckLength={state.deck.length}
        />
        <BettingCircle
          ref={circleRef}
          chipStack={state.chipStack}
          bettedAssets={state.bettedAssets}
          result={state.result}
          onUndo={handleUndo}
          onRemoveAsset={handleRemoveAsset}
          playerHands={state.playerHands}
        />
        <PlayerArea
          playerHands={state.playerHands}
          activeHandIndex={state.activeHandIndex}
          phase={state.phase}
          bettedAssets={state.bettedAssets}
        />
        {state.phase === 'result' && state.result && (
          <ResultBanner
            result={state.result}
            playerHands={state.playerHands}
            displayOnly
          />
        )}
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
              inDebtMode={state.inDebtMode}
              tableLevel={state.tableLevel}
              onChipTap={handleChipTap}
              onUndo={handleUndo}
              onClear={handleClear}
              onAllIn={handleAllIn}
              onDeal={handleDeal}
              onBetAsset={handleBetAsset}
              onToggleAssetMenu={handleToggleAssetMenu}
              onTakeLoan={handleTakeLoan}
            />
          )}
          {state.phase === 'playing' && (
            <ActionButtons
              onHit={handleHit}
              onStand={handleStand}
              onDoubleDown={handleDoubleDown}
              canDoubleDown={canDoubleDown}
              onSplit={handleSplit}
              canSplit={canSplit}
            />
          )}
          {state.phase === 'dealerTurn' && (
            <div className={styles.waitingMessage}>Dealer&apos;s turn...</div>
          )}
          {state.phase === 'result' && state.chipStack.length === 0 && (
            <ResultBanner
              result={state.result}
              bankroll={state.bankroll}
              playerHands={state.playerHands}
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

      {/* Loan confirmation modal for split/double when broke */}
      {pendingLoanAction && (
        <div className={styles.confirmOverlay} onClick={handleCancelLoan}>
          <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <span className={styles.confirmEmoji}>&#x1F911;</span>
            <span className={styles.confirmName}>Taking Out a Loan</span>
            <span className={styles.loanSubtext}>
              The house charges interest on every borrowed dollar.
            </span>
            <div className={styles.confirmButtons}>
              <button className={styles.confirmBet} onClick={handleConfirmLoan}>
                DO IT
              </button>
              <button className={styles.confirmCancel} onClick={handleCancelLoan}>
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

      {state.notificationsEnabled && state.tableLevelChanged && (
        <TableLevelToast
          levelChange={state.tableLevelChanged}
          onDismiss={handleDismissTableToast}
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

      {state.showDebtTracker && (
        <DebtTracker
          bankrollHistory={state.bankrollHistory}
          peakBankroll={state.peakBankroll}
          lowestBankroll={state.lowestBankroll}
          handsPlayed={state.handsPlayed}
          totalVigPaid={state.totalVigPaid}
          onClose={handleToggleDebtTracker}
        />
      )}
    </div>
  )
}

export default SoloGame
