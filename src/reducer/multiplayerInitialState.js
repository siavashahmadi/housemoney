export const multiplayerInitialState = {
  // Connection
  connected: false,
  playerId: null,
  roomCode: null,
  error: null,

  // Lobby
  playerName: '',
  players: [],
  isHost: false,

  // Game state (from server)
  phase: 'disconnected', // disconnected | lobby | betting | playing | dealer_turn | result
  round: 0,
  dealerHand: [],
  dealerValue: null,
  currentPlayerId: null,
  playerStates: {},

  // Local-only betting UX (chip stacking is client-side per spec Section 8.5)
  chipStack: [],
  selectedChipValue: 100,
  showAssetMenu: false,
  betSubmitted: false,

  // Result countdown
  nextRoundAt: null,

  // Quick chat
  chatMessages: [],

  // Session stats
  sessionStats: null,
  showLeaderboard: false,

  // Audio
  muted: false,
}
