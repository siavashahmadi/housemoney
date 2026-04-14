// Action type constants
export const SLOTS_SET_BET = 'SLOTS_SET_BET'
export const SLOTS_SPIN = 'SLOTS_SPIN'
export const SLOTS_REEL_STOP = 'SLOTS_REEL_STOP'
export const SLOTS_RESOLVE = 'SLOTS_RESOLVE'
export const SLOTS_NEW_ROUND = 'SLOTS_NEW_ROUND'
export const SLOTS_RESET = 'SLOTS_RESET'
export const SLOTS_TOGGLE_MUTE = 'SLOTS_TOGGLE_MUTE'

// Action creators
export const slotsSetBet = (amount) => ({ type: SLOTS_SET_BET, amount })
export const slotsSpin = (reels) => ({ type: SLOTS_SPIN, reels })
export const slotsReelStop = (index) => ({ type: SLOTS_REEL_STOP, index })
export const slotsResolve = () => ({ type: SLOTS_RESOLVE })
export const slotsReset = () => ({ type: SLOTS_RESET })
