import { STARTING_BANKROLL } from '../constants/gameConfig'
import { ASSETS } from '../constants/assets'

export function createInitialState() {
  const ownedAssets = {}
  for (const asset of ASSETS) {
    ownedAssets[asset.id] = true
  }

  return {
    // Deck — intentionally empty; callers must supply a shuffled deck
    deck: [],

    // Hands
    playerHand: [],
    dealerHand: [],

    // Money
    bankroll: STARTING_BANKROLL,
    currentBet: 0,
    chipStack: [],
    selectedChipValue: 100,

    // Assets
    ownedAssets,
    bettedAssets: [],

    // Game flow
    phase: 'betting',
    result: null,
    isDoubledDown: false,
    isAllIn: false,

    // Dealer
    dealerMessage: '',

    // Stats
    handsPlayed: 0,
    winStreak: 0,
    loseStreak: 0,
    totalWon: 0,
    totalLost: 0,
    peakBankroll: STARTING_BANKROLL,
    lowestBankroll: STARTING_BANKROLL,

    // Systems
    unlockedAchievements: [],
    seenLoanThresholds: [],
    shownDealerLines: {},

    // UI
    showAssetMenu: false,
    showAchievements: false,
    achievementQueue: [],
    loanSharkQueue: [],
    muted: false,
    notificationsEnabled: true,
  }
}

export const initialState = createInitialState()
