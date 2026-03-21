import { DEALER_LINES } from '../constants/dealerLines'
import { formatMoney } from './formatters'

/**
 * Selects a dealer line from the given category, avoiding repeats
 * until all lines in that category have been shown.
 *
 * Returns { message, updatedShownLines } where updatedShownLines
 * is the new shownDealerLines state with the selected index tracked.
 */
export function selectDealerLine(category, shownDealerLines, context = {}) {
  const lines = DEALER_LINES[category]
  if (!lines || lines.length === 0) {
    return { message: '', updatedShownLines: shownDealerLines }
  }

  const shown = shownDealerLines[category] || []

  // If all lines have been shown, reset this category
  let available
  let newShown
  if (shown.length >= lines.length) {
    available = lines.map((_, i) => i)
    newShown = []
  } else {
    available = lines.map((_, i) => i).filter(i => !shown.includes(i))
    newShown = [...shown]
  }

  // Pick random index from available
  const idx = available[Math.floor(Math.random() * available.length)]
  newShown.push(idx)

  // Resolve line — call if function, return if string
  const line = lines[idx]
  const message = typeof line === 'function' ? line(context) : line

  return {
    message,
    updatedShownLines: { ...shownDealerLines, [category]: newShown },
  }
}

/**
 * Determines which dealer line category to use based on state transition.
 *
 * Returns { category, context } or null if no message should be shown.
 */
export function determineDealerCategory(prevState, newState, trigger) {
  if (trigger === 'resolve') {
    const { result, isDoubledDown, winStreak, loseStreak, bankroll } = newState
    const isLoss = result === 'lose' || result === 'bust'
    const isWin = result === 'win' || result === 'dealerBust' || result === 'blackjack'

    // Priority order for resolve-time messages
    if (result === 'bust' && isDoubledDown) {
      return { category: 'doubleDownLoss', context: {} }
    }
    if (result === 'bust') {
      return { category: 'playerBust', context: {} }
    }
    if (result === 'blackjack') {
      return { category: 'playerBlackjack', context: {} }
    }
    // Asset lost — check prevState since bettedAssets is cleared by RESOLVE_HAND
    if (isLoss && prevState.bettedAssets.length > 0) {
      const assetName = prevState.bettedAssets[0].name
      return { category: 'assetLost', context: { assetName } }
    }
    // Double down loss (non-bust)
    if (isLoss && isDoubledDown) {
      return { category: 'doubleDownLoss', context: {} }
    }
    // First time going broke
    if (isLoss && bankroll <= 0 && prevState.bankroll > 0) {
      return { category: 'playerBroke', context: {} }
    }
    // Deep debt
    if (isLoss && bankroll < -100000) {
      return { category: 'deepDebt', context: { debt: bankroll } }
    }
    // Win streak
    if (isWin && winStreak >= 3) {
      return { category: 'winStreak', context: { winStreak } }
    }
    // Lose streak
    if (isLoss && loseStreak >= 3) {
      return { category: 'loseStreak', context: { loseStreak } }
    }
    // Generic win/lose
    if (isWin) {
      return { category: 'playerWin', context: {} }
    }
    if (isLoss) {
      return { category: 'playerLose', context: {} }
    }
    // Push — no dealer comment
    return null
  }

  if (trigger === 'deal') {
    if (newState.bankroll < 0) {
      return { category: 'playerDebt', context: { debt: newState.bankroll } }
    }
    if (newState.currentBet > 5000 && newState.bankroll >= 0) {
      return {
        category: 'bigBet',
        context: { betAmount: newState.currentBet },
      }
    }
    return null
  }

  if (trigger === 'betAsset') {
    const latest = newState.bettedAssets[newState.bettedAssets.length - 1]
    if (latest) {
      return { category: 'assetBet', context: { assetName: latest.name } }
    }
    return null
  }

  if (trigger === 'reset') {
    return { category: 'greeting', context: {} }
  }

  return null
}
