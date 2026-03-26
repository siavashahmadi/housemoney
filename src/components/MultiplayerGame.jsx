import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import audioManager from '../utils/audioManager'
import { cardValue } from '../utils/cardUtils'
import { useMultiplayerSound } from '../hooks/useMultiplayerSound'
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
import styles from './MultiplayerGame.module.css'

let flyingChipId = 0

function MultiplayerGame({ state, send, dispatch, onLeave }) {
  const stateRef = useRef(state)
  stateRef.current = state

  useMultiplayerSound(state)

  const [flyingChips, setFlyingChips] = useState([])
  const circleRef = useRef(null)

  // Local player data from server state
  const localPlayer = state.playerStates[state.playerId] || {}
  const bankroll = localPlayer.bankroll ?? 0
  const ownedAssets = localPlayer.owned_assets || {}
  const bettedAssets = localPlayer.betted_assets || []
  const localResult = localPlayer.result

  // Is it my turn?
  const isMyTurn = state.currentPlayerId === state.playerId
  const currentPlayerName = useMemo(() => {
    if (!state.currentPlayerId) return null
    const p = state.playerStates[state.currentPlayerId]
    return p?.name || null
  }, [state.currentPlayerId, state.playerStates])

  // Server already hides the hole card by sending rank:'?' — don't double-hide
  const hideHoleCard = false

  // Chip stacking handlers (client-side UX, identical to solo)
  const handleChipTap = useCallback((value, event) => {
    if (stateRef.current.betSubmitted) return
    navigator.vibrate?.(10)
    const isFirst = stateRef.current.chipStack.length === 0
    audioManager.play(isFirst ? 'chip_place' : 'chip_stack')
    dispatch({ type: MP_SELECT_CHIP, value })
    dispatch({ type: MP_ADD_CHIP, value })

    if (event?.target && circleRef.current) {
      const from = event.target.getBoundingClientRect()
      const to = circleRef.current.getBoundingClientRect()
      const id = ++flyingChipId
      setFlyingChips(prev => [...prev, {
        id, value,
        from: { x: from.left + from.width / 2 - 18, y: from.top + from.height / 2 - 18 },
        to: { x: to.left + to.width / 2 - 18, y: to.top + to.height / 2 - 18 },
      }])
    }
  }, [dispatch])

  const handleUndo = useCallback(() => {
    if (stateRef.current.betSubmitted) return
    const { chipStack } = stateRef.current
    if (chipStack.length === 0) return
    dispatch({ type: MP_UNDO_CHIP })

    if (circleRef.current) {
      const circleRect = circleRef.current.getBoundingClientRect()
      const from = { x: circleRect.left + circleRect.width / 2 - 18, y: circleRect.top + circleRect.height / 2 - 18 }
      const to = { x: from.x, y: from.y + 200 }
      const id = ++flyingChipId
      setFlyingChips(prev => [...prev, {
        id, value: chipStack[chipStack.length - 1], from, to,
      }])
    }
  }, [dispatch])

  const handleClear = useCallback(() => dispatch({ type: MP_CLEAR_CHIPS }), [dispatch])
  const handleAllIn = useCallback(() => dispatch({ type: MP_ALL_IN }), [dispatch])
  const handleToggleAssetMenu = useCallback(() => dispatch({ type: MP_TOGGLE_ASSET_MENU }), [dispatch])

  // Submit bet to server (equivalent of "DEAL" in solo)
  const handlePlaceBet = useCallback(() => {
    const total = stateRef.current.chipStack.reduce((sum, v) => sum + v, 0)
    send({ type: 'place_bet', amount: total })
  }, [send])

  // Asset betting — sends to server
  const handleBetAsset = useCallback((asset) => {
    send({ type: 'bet_asset', asset_id: asset.id })
  }, [send])

  // In-flight guard — prevents rapid double-sends, clears reactively on server response
  const actionPendingRef = useRef(false)
  const guardedSend = useCallback((msg) => {
    if (actionPendingRef.current) return
    actionPendingRef.current = true
    send(msg)
  }, [send])

  useEffect(() => {
    actionPendingRef.current = false
  }, [state.playerStates, state.phase, state.currentPlayerId])

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

  const removeFlyingChip = useCallback((id) => {
    setFlyingChips(prev => prev.filter(c => c.id !== id))
  }, [])

  const currentBetTotal = useMemo(() =>
    state.chipStack.reduce((sum, v) => sum + v, 0),
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
    return cardValue(activeHand.cards[0]) === cardValue(activeHand.cards[1])
  }, [state.phase, isMyTurn, localPlayer.hands, localPlayer.active_hand_index])

  return (
    <div className={styles.game}>
      <Header
        bankroll={bankroll}
        mode="multiplayer"
        roomCode={state.roomCode}
        onLeave={handleLeave}
        muted={state.muted}
        onToggleMute={() => dispatch({ type: MP_TOGGLE_MUTE })}
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
          dealerMessage=""
        />

        {/* Show betting circle only during betting phase for local player */}
        {state.phase === 'betting' && !state.betSubmitted && (
          <BettingCircle
            ref={circleRef}
            chipStack={state.chipStack}
            bettedAssets={bettedAssets}
            result={null}
            onUndo={handleUndo}
            onRemoveAsset={() => {}}
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
          playerId={state.playerId}
        />

        {state.phase === 'result' && localResult && (
          <ResultBanner
            result={localResult}
            playerHands={localPlayer?.hands || []}
            displayOnly
          />
        )}
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
              onChipTap={handleChipTap}
              onUndo={handleUndo}
              onClear={handleClear}
              onAllIn={handleAllIn}
              onDeal={handlePlaceBet}
              onBetAsset={handleBetAsset}
              onToggleAssetMenu={handleToggleAssetMenu}
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

          {state.phase === 'dealer_turn' && (
            <div className={styles.waitingMessage}>Dealer&apos;s turn...</div>
          )}

          {state.phase === 'result' && (
            <ResultBanner
              result={localResult}
              bankroll={bankroll}
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
    </div>
  )
}

export default MultiplayerGame
