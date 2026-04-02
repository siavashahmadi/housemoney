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
    playerHands: [],    // Array of hand objects (see createHandObject)
    activeHandIndex: 0,
    dealerHand: [],

    // Money
    bankroll: STARTING_BANKROLL,
    chipStack: [],
    selectedChipValue: 100,

    // Vig
    vigAmount: 0,
    vigRate: 0,
    totalVigPaid: 0,

    // Assets
    ownedAssets,
    bettedAssets: [],

    // Debt gate
    inDebtMode: false,

    // Table level
    tableLevel: 0,
    tableLevelChanged: null,
    pendingTableUpgrade: null,
    declinedTableUpgrade: null,

    // Dealer personality
    currentDealer: 'kyle',
    highestTableLevel: 0,

    // Game flow
    phase: 'betting',
    result: null,
    isAllIn: false,

    // Dealer
    dealerMessage: '',

    // Stats
    handsPlayed: 0,
    handsWon: 0,
    blackjackCount: 0,
    winStreak: 0,
    loseStreak: 0,
    bestWinStreak: 0,
    bestLoseStreak: 0,
    biggestWin: 0,
    biggestLoss: 0,
    totalWagered: 0,
    doublesWon: 0,
    doublesLost: 0,
    splitsWon: 0,
    splitsLost: 0,
    totalWon: 0,
    totalLost: 0,
    peakBankroll: STARTING_BANKROLL,
    lowestBankroll: STARTING_BANKROLL,
    bankrollHistory: [],
    handHistory: [],

    // Systems
    unlockedAchievements: [],
    seenLoanThresholds: [],
    seenCompThresholds: [],
    compQueue: [],
    shownDealerLines: {},

    // Side bets
    activeSideBets: [],    // [{ type, amount }] placed during betting
    sideBetResults: [],    // [{ type, amount, won, payout }] resolved
    showSideBets: false,   // UI toggle

    // UI
    showAssetMenu: false,
    showAchievements: false,
    showDebtTracker: false,
    showHandHistory: false,
    achievementQueue: [],
    loanSharkQueue: [],
    muted: false,
    notificationsEnabled: true,
  }
}

export function createHandObject(cards = [], bet = 0) {
  return {
    cards,
    bet,
    isDoubledDown: false,
    isSplitAces: false,
    status: 'playing',
    result: null,
    payout: 0,
  }
}

