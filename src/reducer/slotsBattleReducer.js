import { slotsBattleInitialState } from './slotsBattleInitialState'

// Local-only action types
export const SLOTS_BATTLE_SET_NAME = 'SLOTS_BATTLE_SET_NAME'
export const SLOTS_BATTLE_CLEAR_ERROR = 'SLOTS_BATTLE_CLEAR_ERROR'
export const SLOTS_BATTLE_FORCE_LEAVE = 'SLOTS_BATTLE_FORCE_LEAVE'
export const SLOTS_BATTLE_TOGGLE_MUTE = 'SLOTS_BATTLE_TOGGLE_MUTE'

/** Extract players list and host status from a players array */
function extractPlayersInfo(playerId, players) {
  if (!players) return {}
  const isHost = players.some(p => p.player_id === playerId && p.is_host)
  return { players, isHost }
}

/** Apply full room state snapshot from server */
function applyRoomState(state, roomState) {
  if (!roomState) return state
  return {
    ...state,
    phase: roomState.phase ?? state.phase,
    currentRound: roomState.current_round ?? state.currentRound,
    totalRounds: roomState.total_rounds ?? state.totalRounds,
    betPerRound: roomState.bet_per_round ?? state.betPerRound,
    buyIn: roomState.buy_in ?? state.buyIn,
    pot: roomState.pot ?? state.pot,
    playerStates: roomState.player_states ?? state.playerStates,
  }
}

export function slotsBattleReducer(state, action) {
  switch (action.type) {

    // ===== Connection =====

    case 'WS_CONNECTED':
      return { ...state, connected: true, error: null }

    case 'WS_DISCONNECTED':
      return { ...state, connected: false }

    // ===== Local-only =====

    case SLOTS_BATTLE_SET_NAME:
      return { ...state, playerName: action.name }

    case SLOTS_BATTLE_CLEAR_ERROR:
      return { ...state, error: null }

    case SLOTS_BATTLE_FORCE_LEAVE:
      return { ...slotsBattleInitialState, connected: state.connected, playerName: state.playerName }

    case SLOTS_BATTLE_TOGGLE_MUTE:
      return { ...state, muted: !state.muted }

    // ===== Server: Lobby =====

    case 'SERVER_SLOTS_ROOM_CREATED': {
      const { code, player_id, session_token, players } = action.payload
      return {
        ...state,
        roomCode: code,
        playerId: player_id,
        sessionToken: session_token,
        phase: 'lobby',
        error: null,
        ...extractPlayersInfo(player_id, players),
      }
    }

    case 'SERVER_SLOTS_PLAYER_JOINED': {
      const { player_id, session_token, code, players } = action.payload
      const newPlayerId = state.playerId || player_id
      const updates = {
        ...state,
        playerId: newPlayerId,
        roomCode: code || state.roomCode,
        phase: 'lobby',
        error: null,
        ...extractPlayersInfo(newPlayerId, players),
      }
      if (session_token) {
        updates.sessionToken = session_token
      }
      return updates
    }

    case 'SERVER_SLOTS_CONFIGURED': {
      const { total_rounds, bet_per_round } = action.payload
      return {
        ...state,
        totalRounds: total_rounds ?? state.totalRounds,
        betPerRound: bet_per_round ?? state.betPerRound,
      }
    }

    // ===== Server: Game =====

    case 'SERVER_SLOTS_GAME_STARTED': {
      const p = action.payload
      let newState = {
        ...state,
        phase: 'spinning',
        currentRound: p.current_round,
        totalRounds: p.total_rounds,
        betPerRound: p.bet_per_round,
        buyIn: p.buy_in,
        pot: p.pot,
        roundResults: null,
        finalStandings: null,
        winnerId: null,
        isTie: false,
      }
      if (p.state) {
        newState = applyRoomState(newState, p.state)
      }
      return newState
    }

    case 'SERVER_SLOTS_SPIN_RESULT': {
      const { player_id, reels, multiplier, match_type, total_score } = action.payload
      const existingPlayer = state.playerStates[player_id] || {}
      return {
        ...state,
        playerStates: {
          ...state.playerStates,
          [player_id]: {
            ...existingPlayer,
            reels,
            roundScore: multiplier,
            matchType: match_type,
            totalScore: total_score,
            hasSpun: true,
          },
        },
      }
    }

    case 'SERVER_SLOTS_ROUND_RESULT': {
      const { standings } = action.payload
      let newState = { ...state, roundResults: standings, phase: 'round_result' }
      if (action.payload.state) {
        newState = applyRoomState(newState, action.payload.state)
      }
      return newState
    }

    case 'SERVER_SLOTS_ROUND_STARTED': {
      let newState = {
        ...state,
        phase: 'spinning',
        currentRound: action.payload.current_round,
        roundResults: null,
      }
      if (action.payload.state) {
        newState = applyRoomState(newState, action.payload.state)
      }
      return newState
    }

    case 'SERVER_SLOTS_GAME_ENDED': {
      const p = action.payload
      let newState = {
        ...state,
        phase: 'final_result',
        finalStandings: p.final_standings,
        pot: p.pot,
        buyIn: p.buy_in,
        isTie: p.is_tie,
        payoutType: p.payout_type,
        winnerId: p.winner_id,
        winnerPayout: p.winner_payout,
        houseCut: p.house_cut,
      }
      if (p.state) {
        newState = applyRoomState(newState, p.state)
      }
      return newState
    }

    case 'SERVER_SLOTS_PLAYER_LEFT': {
      const { players } = action.payload
      return {
        ...state,
        ...extractPlayersInfo(state.playerId, players),
      }
    }

    case 'SERVER_SLOTS_RETURNED_TO_LOBBY': {
      let newState = {
        ...state,
        phase: 'lobby',
        currentRound: 0,
        roundResults: null,
        finalStandings: null,
        winnerId: null,
        isTie: false,
        payoutType: null,
      }
      if (action.payload.state) {
        newState = applyRoomState(newState, action.payload.state)
      }
      return newState
    }

    // ===== Server: Leave/Error =====

    case 'SERVER_LEFT_ROOM':
      return { ...slotsBattleInitialState, connected: state.connected, playerName: state.playerName }

    case 'SERVER_ERROR':
      return { ...state, error: action.payload.message }

    default:
      return state
  }
}
