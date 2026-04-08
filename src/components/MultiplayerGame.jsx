import { useCallback, useEffect, useMemo, useRef } from 'react'
import { sumChipStack } from '../utils/chipUtils'
import { useMultiplayerSound } from '../hooks/useMultiplayerSound'
import { useChipInteraction } from '../hooks/useChipInteraction'
import {
  MP_ADD_CHIP, MP_UNDO_CHIP, MP_CLEAR_CHIPS, MP_SELECT_CHIP,
  MP_ALL_IN, MP_TOGGLE_ASSET_MENU, MP_TOGGLE_MUTE,
} from '../reducer/multiplayerReducer'
import Header from './Header'
import BankrollDisplay from './BankrollDisplay'
import DealerArea from './DealerArea'
import MultiplayerTable from './MultiplayerTable'
import BettingCircle from './BettingCircle'
import BettingControls from './BettingControls'
import ActionButtons from './ActionButtons'
import WaitingIndicator from './WaitingIndicator'
import ResultBanner from './ResultBanner'
import FlyingChip from './FlyingChip'
import QuickChat from './QuickChat'
import SessionLeaderboard from './SessionLeaderboard'
import { STARTING_BANKROLL } from '../constants/gameConfig'
import { getTableLevel } from '../constants/tableLevels'
import styles from './MultiplayerGame.module.css'

const noop = () => {}

const mpChipActions = {
  shouldBlock: (s) => s.betSubmitted,
  shouldBlockUndo: (s) => s.betSubmitted,
  selectChip: (dispatch, value) => dispatch({ type: MP_SELECT_CHIP, value }),
  addChip: (dispatch, value) => dispatch({ type: MP_ADD_CHIP, value }),
  undo: (dispatch) => dispatch({ type: MP_UNDO_CHIP }),
}

function MultiplayerGame({ state, send, dispatch, onLeave }) {
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state })

  useMultiplayerSound(state)

  const circleRef = useRef(null)
  const { flyingChips, handleChipTap, handleUndo, removeFlyingChip } = useChipInteraction(
    dispatch, mpChipActions, stateRef, circleRef
  )

  // Local player data from server state
  const localPlayer = state.playerStates[state.playerId] || {}
  const bankroll = localPlayer.bankroll ?? 0
  const ownedAssets = localPlayer.owned_assets || {}
  const bettedAssets = localPlayer.betted_assets || []
  const inDebtMode = localPlayer.in_debt_mode || false
  const localResult = localPlayer.result
  const tableLevel = useMemo(() => getTableLevel(bankroll), [bankroll])

  // Is it my turn?
  const isMyTurn = state.currentPlayerId === state.playerId
  const currentPlayerName = useMemo(() => {
    if (!state.currentPlayerId) return null
    const p = state.playerStates[state.currentPlayerId]
    return p?.name || null
  }, [state.currentPlayerId, state.playerStates])

  // Server already hides the hole card by sending rank:'?' — don't double-hide
  const hideHoleCard = false

  const handleToggleMute = useCallback(() => dispatch({ type: MP_TOGGLE_MUTE }), [dispatch])
  const handleClear = useCallback(() => dispatch({ type: MP_CLEAR_CHIPS }), [dispatch])
  const handleAllIn = useCallback(() => dispatch({ type: MP_ALL_IN }), [dispatch])
  const handleToggleAssetMenu = useCallback(() => dispatch({ type: MP_TOGGLE_ASSET_MENU }), [dispatch])
  const handleTakeLoan = useCallback(() => send({ type: 'take_loan' }), [send])

  // Submit bet to server (equivalent of "DEAL" in solo)
  const handlePlaceBet = useCallback(() => {
    const total = sumChipStack(stateRef.current.chipStack)
    send({ type: 'place_bet', amount: total })
  }, [send])

  // Asset betting — sends to server
  const handleBetAsset = useCallback((asset) => {
    send({ type: 'bet_asset', asset_id: asset.id })
  }, [send])

  // In-flight guard — prevents rapid double-sends, clears reactively on server response
  const actionPendingRef = useRef(false)
  const actionTimeoutRef = useRef(null)
  const guardedSend = useCallback((msg) => {
    if (actionPendingRef.current) return
    actionPendingRef.current = true
    // Safety timeout — auto-reset if server doesn't respond with state change
    clearTimeout(actionTimeoutRef.current)
    actionTimeoutRef.current = setTimeout(() => {
      actionPendingRef.current = false
    }, 5000)
    send(msg)
  }, [send])

  useEffect(() => {
    actionPendingRef.current = false
    clearTimeout(actionTimeoutRef.current)
  }, [localPlayer.status, localPlayer.hands, state.phase, state.currentPlayerId])

  useEffect(() => () => clearTimeout(actionTimeoutRef.current), [])

  // Game actions — send to server
  const handleHit = useCallback(() => guardedSend({ type: 'hit' }), [guardedSend])
  const handleStand = useCallback(() => guardedSend({ type: 'stand' }), [guardedSend])
  const handleDoubleDown = useCallback(() => guardedSend({ type: 'double_down' }), [guardedSend])
  const handleSplit = useCallback(() => guardedSend({ type: 'split' }), [guardedSend])

  const handleLeave = useCallback(() => {
    send({ type: 'leave' })
    onLeave()
  }, [send, onLeave])

  const handleViewStats = useCallback(() => {
    send({ type: 'view_stats' })
  }, [send])

  const currentBetTotal = useMemo(() =>
    sumChipStack(state.chipStack),
    [state.chipStack]
  )

  const canDoubleDown = useMemo(() => {
    if (state.phase !== 'playing' || !isMyTurn) return false
    const activeHand = localPlayer.hands?.[localPlayer.active_hand_index]
    return activeHand?.cards?.length === 2 && !activeHand.is_doubled_down && !activeHand.is_split_aces
  }, [state.phase, isMyTurn, localPlayer.hands, localPlayer.active_hand_index])

  const canSplit = useMemo(() => {
    if (state.phase !== 'playing' || !isMyTurn) return false
    const activeHand = localPlayer.hands?.[localPlayer.active_hand_index]
    if (!activeHand || activeHand.cards?.length !== 2) return false
    if (activeHand.is_split_aces) return false
    if ((localPlayer.hands?.length || 0) >= 4) return false
    return activeHand.cards[0].rank === activeHand.cards[1].rank
  }, [state.phase, isMyTurn, localPlayer.hands, localPlayer.active_hand_index])

  return (
    <div className={styles.game}>
      <Header
        bankroll={bankroll}
        mode="multiplayer"
        roomCode={state.roomCode}
        onLeave={handleLeave}
        muted={state.muted}
        onToggleMute={handleToggleMute}
        isHost={state.isHost}
        onViewStats={handleViewStats}
      />
      <BankrollDisplay
        bankroll={bankroll}
        currentBetTotal={state.betSubmitted ? (localPlayer.bet || 0) : currentBetTotal}
        handsPlayed={localPlayer.stats?.hands_played || 0}
        vigAmount={localPlayer.vig_amount || 0}
        vigRate={localPlayer.vig_rate || 0}
      />

      <div className={styles.tableArea}>
        <DealerArea
          hand={state.dealerHand}
          phase={state.phase}
          hideHoleCard={hideHoleCard}
          dealerMessage={state.dealerMessage || ""}
        />

        {/* Show betting circle only during betting phase for local player */}
        {state.phase === 'betting' && !state.betSubmitted && (
          <BettingCircle
            ref={circleRef}
            chipStack={state.chipStack}
            bettedAssets={bettedAssets}
            result={null}
            onUndo={handleUndo}
            onRemoveAsset={noop}
          />
        )}

        <MultiplayerTable
          playerStates={state.playerStates}
          playerId={state.playerId}
          currentPlayerId={state.currentPlayerId}
        />

        <QuickChat
          chatMessages={state.chatMessages}
          dispatch={dispatch}
          send={send}
        />

      </div>

      <div className={styles.controlsArea}>
        <div className={styles.phaseContent}>
          {state.phase === 'betting' && !state.betSubmitted && (
            <BettingControls
              bankroll={bankroll}
              selectedChipValue={state.selectedChipValue}
              chipStack={state.chipStack}
              ownedAssets={ownedAssets}
              bettedAssets={bettedAssets}
              showAssetMenu={state.showAssetMenu}
              inDebtMode={inDebtMode}
              tableLevel={tableLevel}
              onChipTap={handleChipTap}
              onUndo={handleUndo}
              onClear={handleClear}
              onAllIn={handleAllIn}
              onDeal={handlePlaceBet}
              onBetAsset={handleBetAsset}
              onToggleAssetMenu={handleToggleAssetMenu}
              onTakeLoan={handleTakeLoan}
            />
          )}

          {state.phase === 'betting' && state.betSubmitted && (
            <WaitingIndicator playerName="other players to bet" />
          )}

          {state.phase === 'playing' && isMyTurn && (
            <ActionButtons
              onHit={handleHit}
              onStand={handleStand}
              onDoubleDown={handleDoubleDown}
              canDoubleDown={canDoubleDown}
              onSplit={handleSplit}
              canSplit={canSplit}
            />
          )}

          {state.phase === 'playing' && !isMyTurn && (
            <WaitingIndicator playerName={currentPlayerName} />
          )}

          {state.phase === 'dealerTurn' && (
            <div className={styles.waitingMessage}>Dealer&apos;s turn...</div>
          )}

          {state.phase === 'result' && (
            <ResultBanner
              result={localResult}
              bankroll={bankroll}
              playerHands={localPlayer?.hands || []}
              autoAdvance
              nextRoundAt={state.nextRoundAt}
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
          onDone={() => removeFlyingChip(chip.id)}
        />
      ))}

      {state.showLeaderboard && state.sessionStats && (
        <SessionLeaderboard
          stats={state.sessionStats}
          onDismiss={() => dispatch({ type: 'DISMISS_LEADERBOARD' })}
        />
      )}

      {/* TODO: Stats panel for multiplayer */}
    </div>
  )
}

export default MultiplayerGame
