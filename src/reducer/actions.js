// Action type constants
export const ADD_CHIP = 'ADD_CHIP'
export const UNDO_CHIP = 'UNDO_CHIP'
export const CLEAR_CHIPS = 'CLEAR_CHIPS'
export const SELECT_CHIP = 'SELECT_CHIP'
export const ALL_IN = 'ALL_IN'
export const DEAL = 'DEAL'
export const BET_ASSET = 'BET_ASSET'
export const HIT = 'HIT'
export const STAND = 'STAND'
export const DOUBLE_DOWN = 'DOUBLE_DOWN'
export const DEALER_DRAW = 'DEALER_DRAW'
export const RESOLVE_HAND = 'RESOLVE_HAND'
export const SPLIT = 'SPLIT'
export const NEW_ROUND = 'NEW_ROUND'
export const RESET_GAME = 'RESET_GAME'
export const TOGGLE_ASSET_MENU = 'TOGGLE_ASSET_MENU'
export const TOGGLE_ACHIEVEMENTS = 'TOGGLE_ACHIEVEMENTS'
export const DISMISS_ACHIEVEMENT = 'DISMISS_ACHIEVEMENT'
export const DISMISS_LOAN_SHARK = 'DISMISS_LOAN_SHARK'
export const SET_LOAN_SHARK_MESSAGE = 'SET_LOAN_SHARK_MESSAGE'
export const UNLOCK_ACHIEVEMENT = 'UNLOCK_ACHIEVEMENT'
export const LOAD_ACHIEVEMENTS = 'LOAD_ACHIEVEMENTS'
export const REMOVE_ASSET = 'REMOVE_ASSET'
export const TOGGLE_MUTE = 'TOGGLE_MUTE'
export const LOAD_HIGHEST_DEBT = 'LOAD_HIGHEST_DEBT'
export const SET_DEALER_MESSAGE = 'SET_DEALER_MESSAGE'
export const TOGGLE_NOTIFICATIONS = 'TOGGLE_NOTIFICATIONS'
export const TOGGLE_DEBT_TRACKER = 'TOGGLE_DEBT_TRACKER'
export const TAKE_LOAN = 'TAKE_LOAN'
export const DISMISS_TABLE_TOAST = 'DISMISS_TABLE_TOAST'
export const ACCEPT_TABLE_UPGRADE = 'ACCEPT_TABLE_UPGRADE'
export const DECLINE_TABLE_UPGRADE = 'DECLINE_TABLE_UPGRADE'
export const TOGGLE_HAND_HISTORY = 'TOGGLE_HAND_HISTORY'
export const SET_COMP_MESSAGE = 'SET_COMP_MESSAGE'
export const DISMISS_COMP = 'DISMISS_COMP'
export const PLACE_SIDE_BET = 'PLACE_SIDE_BET'
export const REMOVE_SIDE_BET = 'REMOVE_SIDE_BET'
export const TOGGLE_SIDE_BETS = 'TOGGLE_SIDE_BETS'

// Action creators for actions with payloads
export const addChip = (value) => ({ type: ADD_CHIP, value })
export const selectChip = (value) => ({ type: SELECT_CHIP, value })
export const deal = (cards, freshDeck) => ({ type: DEAL, cards, freshDeck })
export const betAsset = (asset) => ({ type: BET_ASSET, asset })
export const hit = (card, freshDeck) => ({ type: HIT, card, freshDeck })
export const doubleDown = (card, freshDeck) => ({ type: DOUBLE_DOWN, card, freshDeck })
export const dealerDraw = (card, freshDeck) => ({ type: DEALER_DRAW, card, freshDeck })
export const resolveHand = (outcomes) => ({ type: RESOLVE_HAND, outcomes })
export const split = (cards, freshDeck) => ({ type: SPLIT, cards, freshDeck })
export const removeAsset = (assetId) => ({ type: REMOVE_ASSET, assetId })
export const unlockAchievement = (id) => ({ type: UNLOCK_ACHIEVEMENT, id })
export const loadAchievements = (ids) => ({ type: LOAD_ACHIEVEMENTS, ids })
export const loadHighestDebt = (value) => ({ type: LOAD_HIGHEST_DEBT, value })
export const setDealerMessage = (message, shownDealerLines) => ({
  type: SET_DEALER_MESSAGE,
  message,
  shownDealerLines,
})
export const setLoanSharkMessage = (messages, seenThresholds) => ({
  type: SET_LOAN_SHARK_MESSAGE,
  messages,
  seenThresholds,
})
export const setCompMessage = (messages, seenThresholds, totalCompValue = 0) => ({
  type: SET_COMP_MESSAGE,
  messages,
  seenThresholds,
  totalCompValue,
})
export const takeLoan = () => ({ type: TAKE_LOAN })
export const newRound = (freshDeck) => ({ type: NEW_ROUND, freshDeck })
export const resetGame = (freshDeck) => ({ type: RESET_GAME, freshDeck })
