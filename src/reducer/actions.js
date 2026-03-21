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
export const NEW_ROUND = 'NEW_ROUND'
export const RESET_GAME = 'RESET_GAME'
export const TOGGLE_ASSET_MENU = 'TOGGLE_ASSET_MENU'
export const TOGGLE_ACHIEVEMENTS = 'TOGGLE_ACHIEVEMENTS'
export const DISMISS_ACHIEVEMENT = 'DISMISS_ACHIEVEMENT'
export const DISMISS_LOAN_SHARK = 'DISMISS_LOAN_SHARK'
export const UNLOCK_ACHIEVEMENT = 'UNLOCK_ACHIEVEMENT'
export const REMOVE_ASSET = 'REMOVE_ASSET'
export const TOGGLE_MUTE = 'TOGGLE_MUTE'
export const SET_DEALER_MESSAGE = 'SET_DEALER_MESSAGE'

// Action creators for actions with payloads
export const addChip = (value) => ({ type: ADD_CHIP, value })
export const selectChip = (value) => ({ type: SELECT_CHIP, value })
export const deal = (cards) => ({ type: DEAL, cards })
export const betAsset = (asset) => ({ type: BET_ASSET, asset })
export const hit = (card) => ({ type: HIT, card })
export const doubleDown = (card) => ({ type: DOUBLE_DOWN, card })
export const dealerDraw = (card) => ({ type: DEALER_DRAW, card })
export const resolveHand = (outcome) => ({ type: RESOLVE_HAND, outcome })
export const removeAsset = (assetId) => ({ type: REMOVE_ASSET, assetId })
export const unlockAchievement = (id) => ({ type: UNLOCK_ACHIEVEMENT, id })
export const setDealerMessage = (message, shownDealerLines) => ({
  type: SET_DEALER_MESSAGE,
  message,
  shownDealerLines,
})
