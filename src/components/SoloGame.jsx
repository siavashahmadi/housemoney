import { useReducer, useRef, useCallback, useMemo, useState, useEffect } from 'react'
import { gameReducer } from '../reducer/gameReducer'
import { createInitialState } from '../reducer/initialState'
import { createDeck, shuffle } from '../utils/cardUtils'
import { sumChipStack } from '../utils/chipUtils'
import { drawFromDeck } from '../utils/deckUtils'
import { TABLE_LEVELS } from '../constants/tableLevels'
import {
  addChip, selectChip, deal, hit, doubleDown, split, betAsset, removeAsset,
  takeLoan, newRound, resetGame,
  UNDO_CHIP, CLEAR_CHIPS, ALL_IN, STAND,
  TOGGLE_ASSET_MENU, DISMISS_LOAN_SHARK, TOGGLE_ACHIEVEMENTS, DISMISS_ACHIEVEMENT,
  TOGGLE_MUTE, TOGGLE_NOTIFICATIONS, TOGGLE_DEBT_TRACKER, TOGGLE_HAND_HISTORY, DISMISS_TABLE_TOAST,
  ACCEPT_TABLE_UPGRADE, DECLINE_TABLE_UPGRADE, DISMISS_COMP,
  PLACE_SIDE_BET, REMOVE_SIDE_BET, TOGGLE_SIDE_BETS,
} from '../reducer/actions'
import { useDealerTurn } from '../hooks/useDealerTurn'
import { useDealerMessage } from '../hooks/useDealerMessage'
import { useLoanShark } from '../hooks/useLoanShark'
import { useCasinoComps } from '../hooks/useCasinoComps'
import { useAchievements } from '../hooks/useAchievements'
import { useSound } from '../hooks/useSound'
import { useSessionPersistence } from '../hooks/useSessionPersistence'
import { useChipInteraction } from '../hooks/useChipInteraction'
import { useAssetConfirmation } from '../hooks/useAssetConfirmation'
import Header from './Header'
import BankrollDisplay from './BankrollDisplay'
import DealerArea from './DealerArea'
import PlayerArea from './PlayerArea'
import BettingCircle from './BettingCircle'
import BettingControls from './BettingControls'
import ActionButtons from './ActionButtons'
import ResultBanner from './ResultBanner'
import LoanSharkPopup from './LoanSharkPopup'
import CompToast from './CompToast'
import AchievementToast from './AchievementToast'
import AchievementPanel from './AchievementPanel'
import StatsPanel from './StatsPanel'
import HandHistory from './HandHistory'
import TableLevelToast from './TableLevelToast'
import TableUpgradeModal from './TableUpgradeModal'
import LoanSharkFigures from './LoanSharkFigures'
import SideBetPanel from './SideBetPanel'
import SideBetResults from './SideBetResults'
import FlyingChip from './FlyingChip'
import styles from './SoloGame.module.css'

const soloChipActions = {
  shouldBlock: (s, chipValue) => {
    if (s.phase !== 'betting') return true
    if (s.bankroll < TABLE_LEVELS[s.tableLevel].minBet && !s.inDebtMode) return true
    if (!s.inDebtMode && chipValue && sumChipStack(s.chipStack) + chipValue > s.bankroll) return true
    return false
  },
  shouldBlockUndo: () => false,
  selectChip: (dispatch, value) => dispatch(selectChip(value)),
  addChip: (dispatch, value) => dispatch(addChip(value)),
  undo: (dispatch) => dispatch({ type: UNDO_CHIP }),
}

function SoloGame({ onBack }) {
  const [state, dispatch] = useReducer(gameReducer, null, () => ({
    ...createInitialState(),
    deck: shuffle(createDeck()),
  }))
  const stateRef = useRef(state)
  stateRef.current = state

  const circleRef = useRef(null)
  const trayRef = useRef(null)
  const { flyingChips, handleChipTap, handleUndo, removeFlyingChip } = useChipInteraction(
    dispatch, soloChipActions, stateRef, circleRef, trayRef
  )

  // Dealer turn automation
  useDealerTurn(state, dispatch)
  useDealerMessage(state, dispatch)
  useLoanShark(state, dispatch)
  useCasinoComps(state, dispatch)
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
  const handleAcceptUpgrade = useCallback(() => {
    dispatch({ type: ACCEPT_TABLE_UPGRADE })
  }, [])
  const handleDeclineUpgrade = useCallback(() => {
    dispatch({ type: DECLINE_TABLE_UPGRADE })
  }, [])

  const handleClear = useCallback(() => dispatch({ type: CLEAR_CHIPS }), [])
  const handleAllIn = useCallback(() => dispatch({ type: ALL_IN }), [])

  const handleDeal = useCallback(() => {
    const { cards, deck, reshuffled } = drawFromDeck(stateRef.current.deck, 4)
    dispatch(deal(cards, reshuffled ? deck : undefined))
  }, [])

  const handleHit = useCallback(() => {
    const { cards, reshuffled, deck } = drawFromDeck(stateRef.current.deck, 1)
    dispatch(reshuffled ? hit(null, [cards[0], ...deck]) : hit(cards[0]))
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
    const { cards, reshuffled, deck } = drawFromDeck(s.deck, 1)
    dispatch(reshuffled ? doubleDown(null, [cards[0], ...deck]) : doubleDown(cards[0]))
  }, [])

  const handleSplit = useCallback(() => {
    const s = stateRef.current
    const hand = s.playerHands[s.activeHandIndex]
    if (hand && s.bankroll - hand.bet < 0 && !s.inDebtMode) {
      setPendingLoanAction({ type: 'split' })
      return
    }
    const { cards, reshuffled, deck } = drawFromDeck(s.deck, 2)
    dispatch(reshuffled ? split(null, [cards[0], cards[1], ...deck]) : split(cards))
  }, [])

  const handleConfirmLoan = useCallback(() => {
    const deck = stateRef.current.deck
    dispatch(takeLoan())
    if (pendingLoanAction?.type === 'double') {
      const { cards, reshuffled, deck: remaining } = drawFromDeck(deck, 1)
      dispatch(reshuffled ? doubleDown(null, [cards[0], ...remaining]) : doubleDown(cards[0]))
    } else if (pendingLoanAction?.type === 'split') {
      const { cards, reshuffled, deck: remaining } = drawFromDeck(deck, 2)
      dispatch(reshuffled ? split(null, [cards[0], cards[1], ...remaining]) : split(cards))
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

  const { pendingAssetConfirm, handleBetAsset, handleConfirmAsset, handleCancelAsset } =
    useAssetConfirmation(dispatch, betAsset)

  const handleRemoveAsset = useCallback((assetId) => dispatch(removeAsset(assetId)), [])
  const handleToggleAssetMenu = useCallback(() => dispatch({ type: TOGGLE_ASSET_MENU }), [])
  const handleTakeLoan = useCallback(() => dispatch(takeLoan()), [])
  const handleDismissLoanShark = useCallback(() => dispatch({ type: DISMISS_LOAN_SHARK }), [])
  const handleDismissComp = useCallback(() => dispatch({ type: DISMISS_COMP }), [])
  const handleToggleAchievements = useCallback(() => dispatch({ type: TOGGLE_ACHIEVEMENTS }), [])
  const handleToggleDebtTracker = useCallback(() => dispatch({ type: TOGGLE_DEBT_TRACKER }), [])
  const handleToggleHandHistory = useCallback(() => dispatch({ type: TOGGLE_HAND_HISTORY }), [])
  const handleDismissAchievement = useCallback(() => dispatch({ type: DISMISS_ACHIEVEMENT }), [])
  const handleToggleMute = useCallback(() => dispatch({ type: TOGGLE_MUTE }), [])
  const handleToggleNotifications = useCallback(() => dispatch({ type: TOGGLE_NOTIFICATIONS }), [])
  const handlePlaceSideBet = useCallback((betType) => dispatch({ type: PLACE_SIDE_BET, betType }), [])
  const handleRemoveSideBet = useCallback((betType) => dispatch({ type: REMOVE_SIDE_BET, betType }), [])
  const handleToggleSideBets = useCallback(() => dispatch({ type: TOGGLE_SIDE_BETS }), [])

  // --- Derived state ---
  const currentBetTotal = useMemo(() =>
    sumChipStack(state.chipStack),
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
        onToggleHandHistory={handleToggleHandHistory}
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
        <span className={styles.feltWatermark} key={TABLE_LEVELS[state.tableLevel].id}>
          {TABLE_LEVELS[state.tableLevel].subtitle}
        </span>
        <LoanSharkFigures bankroll={state.bankroll} />
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
        {state.sideBetResults.length > 0 && (
          <SideBetResults results={state.sideBetResults} />
        )}
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
            <>
              <BettingControls
                bankroll={state.bankroll}
                selectedChipValue={state.selectedChipValue}
                chipStack={state.chipStack}
                ownedAssets={state.ownedAssets}
                bettedAssets={state.bettedAssets}
                showAssetMenu={state.showAssetMenu}
                inDebtMode={state.inDebtMode}
                tableLevel={state.tableLevel}
                trayRef={trayRef}
                onChipTap={handleChipTap}
                onUndo={handleUndo}
                onClear={handleClear}
                onAllIn={handleAllIn}
                onDeal={handleDeal}
                onBetAsset={handleBetAsset}
                onToggleAssetMenu={handleToggleAssetMenu}
                onTakeLoan={handleTakeLoan}
                onToggleSideBets={handleToggleSideBets}
                showSideBets={state.showSideBets}
                activeSideBetCount={state.activeSideBets.length}
              />
              {state.showSideBets && (
                <SideBetPanel
                  activeSideBets={state.activeSideBets}
                  onPlace={handlePlaceSideBet}
                  onRemove={handleRemoveSideBet}
                  minBet={TABLE_LEVELS[state.tableLevel].minBet}
                  bankroll={state.bankroll}
                  inDebtMode={state.inDebtMode}
                />
              )}
            </>
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

      {state.notificationsEnabled && state.compQueue.length > 0 && (
        <CompToast
          comp={state.compQueue[0]}
          onDismiss={handleDismissComp}
        />
      )}

      {state.notificationsEnabled && state.tableLevelChanged && (
        <TableLevelToast
          levelChange={state.tableLevelChanged}
          onDismiss={handleDismissTableToast}
        />
      )}

      {state.pendingTableUpgrade && (
        <TableUpgradeModal
          pendingUpgrade={state.pendingTableUpgrade}
          onAccept={handleAcceptUpgrade}
          onDecline={handleDeclineUpgrade}
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
        <StatsPanel state={state} onClose={handleToggleDebtTracker} />
      )}

      {state.showHandHistory && (
        <HandHistory handHistory={state.handHistory} onClose={handleToggleHandHistory} />
      )}
    </div>
  )
}

export default SoloGame
