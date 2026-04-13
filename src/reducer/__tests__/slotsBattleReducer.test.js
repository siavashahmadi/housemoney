import { describe, it, expect } from 'vitest'
import { slotsBattleReducer, SLOTS_BATTLE_SET_NAME, SLOTS_BATTLE_CLEAR_ERROR, SLOTS_BATTLE_FORCE_LEAVE, SLOTS_BATTLE_TOGGLE_MUTE } from '../slotsBattleReducer'
import { slotsBattleInitialState, createSlotsBattleInitialState } from '../slotsBattleInitialState'

function makeState(overrides = {}) {
  return { ...createSlotsBattleInitialState(), ...overrides }
}

describe('slotsBattleReducer', () => {
  // --- Connection ---
  it('handles WS_CONNECTED', () => {
    const state = makeState({ connected: false, error: 'old error' })
    const next = slotsBattleReducer(state, { type: 'WS_CONNECTED' })
    expect(next.connected).toBe(true)
    expect(next.error).toBeNull()
  })

  it('handles WS_DISCONNECTED', () => {
    const state = makeState({ connected: true })
    const next = slotsBattleReducer(state, { type: 'WS_DISCONNECTED' })
    expect(next.connected).toBe(false)
  })

  // --- Local-only ---
  it('handles SLOTS_BATTLE_SET_NAME', () => {
    const state = makeState()
    const next = slotsBattleReducer(state, { type: SLOTS_BATTLE_SET_NAME, name: 'Alice' })
    expect(next.playerName).toBe('Alice')
  })

  it('handles SLOTS_BATTLE_CLEAR_ERROR', () => {
    const state = makeState({ error: 'some error' })
    const next = slotsBattleReducer(state, { type: SLOTS_BATTLE_CLEAR_ERROR })
    expect(next.error).toBeNull()
  })

  it('handles SLOTS_BATTLE_FORCE_LEAVE preserving connection and name', () => {
    const state = makeState({ connected: true, playerName: 'Bob', roomCode: 'ABCD', playerId: 'p1' })
    const next = slotsBattleReducer(state, { type: SLOTS_BATTLE_FORCE_LEAVE })
    expect(next.connected).toBe(true)
    expect(next.playerName).toBe('Bob')
    expect(next.roomCode).toBeNull()
    expect(next.playerId).toBeNull()
  })

  it('handles SLOTS_BATTLE_TOGGLE_MUTE', () => {
    const state = makeState({ muted: false })
    const next = slotsBattleReducer(state, { type: SLOTS_BATTLE_TOGGLE_MUTE })
    expect(next.muted).toBe(true)
    const next2 = slotsBattleReducer(next, { type: SLOTS_BATTLE_TOGGLE_MUTE })
    expect(next2.muted).toBe(false)
  })

  // --- Server: Lobby ---
  it('handles SERVER_SLOTS_ROOM_CREATED', () => {
    const state = makeState({ connected: true })
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_ROOM_CREATED',
      payload: {
        code: 'WXYZ',
        player_id: 'p1',
        session_token: 'tok1',
        players: [{ player_id: 'p1', name: 'Alice', is_host: true, connected: true }],
      },
    })
    expect(next.roomCode).toBe('WXYZ')
    expect(next.playerId).toBe('p1')
    expect(next.sessionToken).toBe('tok1')
    expect(next.phase).toBe('lobby')
    expect(next.isHost).toBe(true)
    expect(next.players).toHaveLength(1)
  })

  it('handles SERVER_SLOTS_PLAYER_JOINED for joiner', () => {
    const state = makeState({ connected: true })
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_PLAYER_JOINED',
      payload: {
        player_id: 'p2',
        session_token: 'tok2',
        code: 'WXYZ',
        players: [
          { player_id: 'p1', name: 'Alice', is_host: true, connected: true },
          { player_id: 'p2', name: 'Bob', is_host: false, connected: true },
        ],
      },
    })
    expect(next.playerId).toBe('p2')
    expect(next.sessionToken).toBe('tok2')
    expect(next.roomCode).toBe('WXYZ')
    expect(next.isHost).toBe(false)
    expect(next.players).toHaveLength(2)
  })

  it('handles SERVER_SLOTS_PLAYER_JOINED for existing player (broadcast)', () => {
    const state = makeState({ connected: true, playerId: 'p1', roomCode: 'WXYZ' })
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_PLAYER_JOINED',
      payload: {
        player_id: 'p2',
        player_name: 'Bob',
        players: [
          { player_id: 'p1', name: 'Alice', is_host: true, connected: true },
          { player_id: 'p2', name: 'Bob', is_host: false, connected: true },
        ],
      },
    })
    expect(next.playerId).toBe('p1')
    expect(next.isHost).toBe(true)
    expect(next.players).toHaveLength(2)
  })

  it('handles SERVER_SLOTS_CONFIGURED', () => {
    const state = makeState({ totalRounds: 10, betPerRound: 100 })
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_CONFIGURED',
      payload: { total_rounds: 15, bet_per_round: 500 },
    })
    expect(next.totalRounds).toBe(15)
    expect(next.betPerRound).toBe(500)
  })

  // --- Server: Game ---
  it('handles SERVER_SLOTS_GAME_STARTED', () => {
    const state = makeState({ phase: 'lobby', playerId: 'p1' })
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_GAME_STARTED',
      payload: {
        total_rounds: 10,
        bet_per_round: 100,
        current_round: 1,
        buy_in: 1000,
        pot: 2000,
        state: {
          phase: 'spinning',
          current_round: 1,
          total_rounds: 10,
          bet_per_round: 100,
          buy_in: 1000,
          pot: 2000,
          player_states: {
            p1: { name: 'Alice', total_score: 0, has_spun: false, round_score: 0, reels: null, match_type: null },
            p2: { name: 'Bob', total_score: 0, has_spun: false, round_score: 0, reels: null, match_type: null },
          },
        },
      },
    })
    expect(next.phase).toBe('spinning')
    expect(next.currentRound).toBe(1)
    expect(next.pot).toBe(2000)
    expect(next.buyIn).toBe(1000)
    expect(Object.keys(next.playerStates)).toHaveLength(2)
  })

  it('handles SERVER_SLOTS_SPIN_RESULT', () => {
    const state = makeState({
      phase: 'spinning',
      playerStates: {
        p1: { name: 'Alice', totalScore: 0, hasSpun: false },
        p2: { name: 'Bob', totalScore: 0, hasSpun: false },
      },
    })
    const reels = [
      { index: 0, name: 'Cherry' },
      { index: 0, name: 'Cherry' },
      { index: 1, name: 'Lemon' },
    ]
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_SPIN_RESULT',
      payload: {
        player_id: 'p1',
        reels,
        multiplier: 0.5,
        match_type: 'pair',
        total_score: 0.5,
      },
    })
    expect(next.playerStates.p1.hasSpun).toBe(true)
    expect(next.playerStates.p1.reels).toEqual(reels)
    expect(next.playerStates.p1.matchType).toBe('pair')
    expect(next.playerStates.p1.totalScore).toBe(0.5)
    expect(next.playerStates.p2.hasSpun).toBe(false)
  })

  it('handles SERVER_SLOTS_ROUND_RESULT', () => {
    const state = makeState({ phase: 'spinning' })
    const standings = [
      { player_id: 'p1', name: 'Alice', round_score: 5, total_score: 5 },
      { player_id: 'p2', name: 'Bob', round_score: 3, total_score: 3 },
    ]
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_ROUND_RESULT',
      payload: { current_round: 1, total_rounds: 10, standings },
    })
    expect(next.phase).toBe('round_result')
    expect(next.roundResults).toEqual(standings)
  })

  it('handles SERVER_SLOTS_ROUND_STARTED', () => {
    const state = makeState({ phase: 'round_result', currentRound: 1 })
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_ROUND_STARTED',
      payload: { current_round: 2, total_rounds: 10 },
    })
    expect(next.phase).toBe('spinning')
    expect(next.currentRound).toBe(2)
    expect(next.roundResults).toBeNull()
  })

  it('handles SERVER_SLOTS_GAME_ENDED with winner', () => {
    const state = makeState({ phase: 'round_result' })
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_GAME_ENDED',
      payload: {
        final_standings: [
          { player_id: 'p1', name: 'Alice', total_score: 50 },
          { player_id: 'p2', name: 'Bob', total_score: 30 },
        ],
        pot: 2000,
        buy_in: 1000,
        is_tie: false,
        payout_type: 'winner',
        winner_id: 'p1',
        winner_payout: 1840,
        house_cut: 160,
      },
    })
    expect(next.phase).toBe('final_result')
    expect(next.isTie).toBe(false)
    expect(next.winnerId).toBe('p1')
    expect(next.winnerPayout).toBe(1840)
    expect(next.houseCut).toBe(160)
    expect(next.finalStandings).toHaveLength(2)
  })

  it('handles SERVER_SLOTS_GAME_ENDED with tie', () => {
    const state = makeState({ phase: 'round_result' })
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_GAME_ENDED',
      payload: {
        final_standings: [
          { player_id: 'p1', name: 'Alice', total_score: 50 },
          { player_id: 'p2', name: 'Bob', total_score: 50 },
        ],
        pot: 2000,
        buy_in: 1000,
        is_tie: true,
        payout_type: 'refund',
        winner_id: null,
        winner_payout: 1000,
        house_cut: 0,
      },
    })
    expect(next.isTie).toBe(true)
    expect(next.payoutType).toBe('refund')
  })

  it('handles SERVER_SLOTS_PLAYER_LEFT', () => {
    const state = makeState({
      playerId: 'p1',
      players: [
        { player_id: 'p1', name: 'Alice', is_host: true, connected: true },
        { player_id: 'p2', name: 'Bob', is_host: false, connected: true },
      ],
    })
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_PLAYER_LEFT',
      payload: {
        player_name: 'Bob',
        players: [{ player_id: 'p1', name: 'Alice', is_host: true, connected: true }],
      },
    })
    expect(next.players).toHaveLength(1)
    expect(next.isHost).toBe(true)
  })

  it('handles SERVER_SLOTS_RETURNED_TO_LOBBY', () => {
    const state = makeState({ phase: 'final_result', currentRound: 10, winnerId: 'p1' })
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_RETURNED_TO_LOBBY',
      payload: {
        state: {
          phase: 'lobby',
          current_round: 0,
          player_states: {},
        },
      },
    })
    expect(next.phase).toBe('lobby')
    expect(next.currentRound).toBe(0)
    expect(next.finalStandings).toBeNull()
    expect(next.winnerId).toBeNull()
  })

  it('handles SERVER_LEFT_ROOM', () => {
    const state = makeState({ connected: true, playerName: 'Alice', roomCode: 'WXYZ', playerId: 'p1', phase: 'lobby' })
    const next = slotsBattleReducer(state, { type: 'SERVER_LEFT_ROOM', payload: {} })
    expect(next.roomCode).toBeNull()
    expect(next.playerId).toBeNull()
    expect(next.connected).toBe(true)
    expect(next.playerName).toBe('Alice')
  })

  it('handles SERVER_ERROR', () => {
    const state = makeState()
    const next = slotsBattleReducer(state, { type: 'SERVER_ERROR', payload: { message: 'Room not found' } })
    expect(next.error).toBe('Room not found')
  })

  it('returns state for unknown action types', () => {
    const state = makeState()
    const next = slotsBattleReducer(state, { type: 'UNKNOWN_ACTION' })
    expect(next).toBe(state)
  })
})
