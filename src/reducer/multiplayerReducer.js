import { multiplayerInitialState } from './multiplayerInitialState'
import { MIN_BET } from '../constants/gameConfig'
import { decomposeIntoChips, sumChipStack } from '../utils/chipUtils'

const NEXT_ROUND_DELAY_MS = 5000
let chatIdCounter = 0

// --- Local-only action types ---
export const MP_ADD_CHIP = 'MP_ADD_CHIP'
export const MP_UNDO_CHIP = 'MP_UNDO_CHIP'
export const MP_CLEAR_CHIPS = 'MP_CLEAR_CHIPS'
export const MP_SELECT_CHIP = 'MP_SELECT_CHIP'
export const MP_ALL_IN = 'MP_ALL_IN'
export const MP_TOGGLE_ASSET_MENU = 'MP_TOGGLE_ASSET_MENU'
export const MP_TOGGLE_MUTE = 'MP_TOGGLE_MUTE'
export const SET_PLAYER_NAME = 'SET_PLAYER_NAME'
export const FORCE_LEAVE = 'FORCE_LEAVE'
export const CLEAR_ERROR = 'CLEAR_ERROR'

// --- Connection action types ---
export const WS_CONNECTED = 'WS_CONNECTED'
export const WS_DISCONNECTED = 'WS_DISCONNECTED'

// --- Helpers ---

/** Apply the full server state snapshot to our local state */
function applyServerState(state, serverState) {
  if (!serverState) return state

  return {
    ...state,
    phase: 'phase' in serverState ? serverState.phase : state.phase,
    round: 'round' in serverState ? serverState.round : state.round,
    dealerHand: 'dealer_hand' in serverState ? serverState.dealer_hand : state.dealerHand,
    dealerValue: 'dealer_value' in serverState ? serverState.dealer_value : state.dealerValue,
    currentPlayerId: 'current_player_id' in serverState ? serverState.current_player_id : state.currentPlayerId,
    playerStates: 'players' in serverState ? serverState.players : state.playerStates,
    dealerMessage: 'dealer_message' in serverState ? serverState.dealer_message : state.dealerMessage,
  }
}

/** Extract players list and host status from a players array */
function extractPlayersInfo(playerId, players) {
  if (!players) return {}
  const isHost = players.some(p => p.player_id === playerId && p.is_host)
  return { players, isHost }
}

/** Get the local player's bankroll from server state */
function getLocalBankroll(state) {
  const localPlayer = state.playerStates[state.playerId]
  return localPlayer?.bankroll ?? 0
}

// --- Reducer ---

export function multiplayerReducer(state, action) {
  switch (action.type) {

    // ===== Connection =====

    case WS_CONNECTED:
      return { ...state, connected: true, error: null }

    case WS_DISCONNECTED:
      return { ...state, connected: false, currentPlayerId: null }

    // ===== Local-only: player name =====

    case SET_PLAYER_NAME:
      return { ...state, playerName: action.name }

    case CLEAR_ERROR:
      return { ...state, error: null }

    // ===== Local-only: chip stacking (client UX, server only sees final amount) =====

    case MP_ADD_CHIP: {
      if (state.betSubmitted) return state
      const bankroll = getLocalBankroll(state)
      const localPlayer = state.playerStates[state.playerId] || {}
      const inDebtMode = localPlayer.in_debt_mode || false
      if (bankroll <= 0 && !inDebtMode) return state
      const newTotal = sumChipStack(state.chipStack) + action.value
      if (newTotal > bankroll && !inDebtMode) return state
      return {
        ...state,
        chipStack: [...state.chipStack, action.value],
        selectedChipValue: action.value,
      }
    }

    case MP_UNDO_CHIP: {
      if (state.betSubmitted || state.chipStack.length === 0) return state
      return {
        ...state,
        chipStack: state.chipStack.slice(0, -1),
      }
    }

    case MP_CLEAR_CHIPS: {
      if (state.betSubmitted) return state
      return { ...state, chipStack: [] }
    }

    case MP_SELECT_CHIP:
      return { ...state, selectedChipValue: action.value }

    case MP_ALL_IN: {
      if (state.betSubmitted) return state
      const bankroll = getLocalBankroll(state)
      const amount = bankroll > 0 ? bankroll : MIN_BET
      return {
        ...state,
        chipStack: decomposeIntoChips(amount),
      }
    }

    case MP_TOGGLE_ASSET_MENU:
      return { ...state, showAssetMenu: !state.showAssetMenu }

    case MP_TOGGLE_MUTE:
      return { ...state, muted: !state.muted }

    // ===== Server messages =====

    case 'SERVER_ROOM_CREATED': {
      const { code, player_id, players } = action.payload
      return {
        ...state,
        roomCode: code,
        playerId: player_id,
        phase: 'lobby',
        error: null,
        ...extractPlayersInfo(player_id, players),
      }
    }

    case 'SERVER_PLAYER_JOINED': {
      const { player_id, code, players } = action.payload
      const newPlayerId = state.playerId || player_id
      return {
        ...state,
        playerId: newPlayerId,
        roomCode: code || state.roomCode,
        phase: 'lobby',
        error: null,
        ...extractPlayersInfo(newPlayerId, players),
      }
    }

    case 'SERVER_GAME_STARTED': {
      const { players } = action.payload
      let newState = {
        ...state,
        phase: 'betting',
        ...extractPlayersInfo(state.playerId, players),
      }
      if (action.payload.state) {
        newState = applyServerState(newState, action.payload.state)
      }
      return newState
    }

    case 'SERVER_BETTING_PHASE': {
      const newState = applyServerState(state, action.payload.state)
      const bpLocalPlayer = newState.playerStates[state.playerId]
      const seedHistory = state.bankrollHistory.length === 0 && bpLocalPlayer
        ? [bpLocalPlayer.bankroll]
        : state.bankrollHistory
      return {
        ...newState,
        chipStack: [],
        betSubmitted: false,
        showAssetMenu: false,
        nextRoundAt: null,
        bankrollHistory: seedHistory,
      }
    }

    case 'SERVER_BET_PLACED': {
      const newState = applyServerState(state, action.payload.state)
      // If it's our bet being confirmed, mark as submitted
      const isSelf = action.payload.player_id === state.playerId
      return {
        ...newState,
        betSubmitted: isSelf ? true : state.betSubmitted,
      }
    }

    case 'SERVER_ASSET_BET':
      return applyServerState(state, action.payload.state)

    case 'SERVER_LOAN_TAKEN':
      return applyServerState(state, action.payload.state)

    case 'SERVER_ASSET_REMOVED':
      return applyServerState(state, action.payload.state)

    case 'SERVER_CARDS_DEALT':
      return {
        ...applyServerState(state, action.payload.state),
        chipStack: [],
        betSubmitted: false,
      }

    case 'SERVER_YOUR_TURN':
      return { ...state, currentPlayerId: action.payload.player_id }

    case 'SERVER_PLAYER_HIT':
      return applyServerState(state, action.payload.state)

    case 'SERVER_PLAYER_STAND':
      return applyServerState(state, action.payload.state)

    case 'SERVER_PLAYER_DOUBLE_DOWN':
      return applyServerState(state, action.payload.state)

    case 'SERVER_PLAYER_SPLIT':
      return applyServerState(state, action.payload.state)

    case 'SERVER_BET_TIMEOUT':
      return { ...applyServerState(state, action.payload.state), betSubmitted: false }

    case 'SERVER_DEALER_TURN_START':
      return applyServerState(state, action.payload.state)

    case 'SERVER_DEALER_CARD':
      return applyServerState(state, action.payload.state)

    case 'SERVER_ROUND_RESULT': {
      const newState = applyServerState(state, action.payload.state)
      const rrLocalPlayer = newState.playerStates[state.playerId]
      const newBankroll = rrLocalPlayer?.bankroll ?? 0
      return {
        ...newState,
        dealerHand: action.payload.dealer_hand,
        dealerValue: action.payload.dealer_value,
        phase: 'result',
        nextRoundAt: Date.now() + NEXT_ROUND_DELAY_MS,
        bankrollHistory: [...state.bankrollHistory, newBankroll],
      }
    }

    case 'SERVER_PLAYER_LEFT': {
      const { players } = action.payload
      const newState = { ...state, ...extractPlayersInfo(state.playerId, players) }
      if (newState.playerStates && players) {
        const activeIds = new Set(players.map(p => p.player_id))
        const filteredStates = {}
        for (const [pid, ps] of Object.entries(newState.playerStates)) {
          if (activeIds.has(pid)) filteredStates[pid] = ps
        }
        newState.playerStates = filteredStates
      }
      return newState
    }

    case 'SERVER_PLAYER_DISCONNECTED': {
      const { players } = action.payload
      const newState = { ...state, ...extractPlayersInfo(state.playerId, players) }
      if (newState.playerStates) {
        const connectedIds = new Set(players.filter(p => p.connected).map(p => p.player_id))
        const updatedStates = {}
        for (const [pid, ps] of Object.entries(newState.playerStates)) {
          updatedStates[pid] = { ...ps, connected: connectedIds.has(pid) }
        }
        newState.playerStates = updatedStates
      }
      return newState
    }

    case 'SERVER_PLAYER_RECONNECTED': {
      const { players } = action.payload
      let newState = { ...state, ...extractPlayersInfo(state.playerId, players) }
      if (action.payload.state) {
        newState = applyServerState(newState, action.payload.state)
      }
      if (newState.playerStates) {
        const connectedIds = new Set(players.filter(p => p.connected).map(p => p.player_id))
        const updatedStates = {}
        for (const [pid, ps] of Object.entries(newState.playerStates)) {
          updatedStates[pid] = { ...ps, connected: connectedIds.has(pid) }
        }
        newState.playerStates = updatedStates
      }
      return newState
    }

    case 'SERVER_LEFT_ROOM':
    case FORCE_LEAVE:
      return { ...multiplayerInitialState, connected: state.connected, playerName: state.playerName }

    case 'SERVER_RECONNECT_FAILED':
      return { ...multiplayerInitialState, connected: state.connected, playerName: state.playerName, error: action.payload.message }

    case 'SERVER_RECONNECTED': {
      const { code, player_id, players, phase, state: serverState } = action.payload
      let newState = {
        ...state,
        roomCode: code,
        playerId: player_id,
        phase: phase || 'lobby',
        error: null,
        chipStack: [],
        showAssetMenu: false,
        nextRoundAt: null,
      }
      newState = { ...newState, ...extractPlayersInfo(player_id, players) }
      if (serverState) {
        newState = applyServerState(newState, serverState)
      }
      const reconnectedPlayer = newState.playerStates[player_id]
      if (reconnectedPlayer) {
        newState.betSubmitted = reconnectedPlayer.status === 'ready'
      }
      return newState
    }

    case 'SERVER_ERROR': {
      const errorState = { ...state, error: action.payload.message }
      if (state.phase === 'betting') {
        errorState.betSubmitted = false
      }
      return errorState
    }

    // ===== Quick Chat =====

    case 'SERVER_QUICK_CHAT': {
      const { player_id, player_name, message_id, message_text } = action.payload
      const chatMsg = {
        id: `${message_id}_${++chatIdCounter}`,
        playerId: player_id,
        playerName: player_name,
        text: message_text,
        timestamp: Date.now(),
      }
      const chatMessages = [...state.chatMessages, chatMsg].slice(-5)
      return { ...state, chatMessages }
    }

    case 'DISMISS_CHAT_MESSAGE':
      return {
        ...state,
        chatMessages: state.chatMessages.filter(m => m.id !== action.id),
      }

    // ===== Session Stats =====

    case 'SERVER_SESSION_STATS':
      return {
        ...state,
        sessionStats: action.payload.stats,
        showLeaderboard: true,
      }

    case 'DISMISS_LEADERBOARD':
      return { ...state, showLeaderboard: false }

    default:
      return state
  }
}
