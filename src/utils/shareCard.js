import { formatMoney } from './formatters'
import { getVigRate } from '../constants/vigRates'

const CARD_W = 600
const CARD_H = 800
const PAD = 32

const TAGLINES = [
  'Professional gambler (self-diagnosed)',
  'I can stop whenever I want',
  'Send help',
  'If found, do not resuscitate my bankroll',
  'Financial literacy was never my strong suit',
  'The house always wins, but I keep trying',
  'My financial advisor blocked my number',
  'I came, I saw, I lost everything',
]

function getTagline(bankroll) {
  if (bankroll >= 50_000) return TAGLINES[0]
  if (bankroll >= 0) return TAGLINES[5]
  if (bankroll >= -10_000) return TAGLINES[1]
  if (bankroll >= -100_000) return TAGLINES[4]
  if (bankroll >= -500_000) return TAGLINES[2]
  if (bankroll >= -1_000_000) return TAGLINES[6]
  return TAGLINES[Math.abs(bankroll) % 2 === 0 ? 3 : 7]
}

function getGrade(bankroll) {
  if (bankroll >= 1_000_000) return 'A+'
  if (bankroll >= 100_000) return 'A'
  if (bankroll >= 50_000) return 'B+'
  if (bankroll >= 10_000) return 'B'
  if (bankroll >= 0) return 'C'
  if (bankroll >= -10_000) return 'D'
  if (bankroll >= -50_000) return 'F'
  if (bankroll >= -250_000) return 'F-'
  if (bankroll >= -1_000_000) return 'F---'
  if (bankroll >= -5_000_000) return 'Z'
  return '\u2620'
}

// Deterministic grain pattern using simple hash
// Uses a temp canvas because putImageData replaces pixels instead of compositing
function drawGrain(ctx) {
  const tmp = document.createElement('canvas')
  tmp.width = CARD_W
  tmp.height = CARD_H
  const tmpCtx = tmp.getContext('2d')
  const imageData = tmpCtx.createImageData(CARD_W, CARD_H)
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    const px = (i / 4) | 0
    // Simple pseudo-random from pixel position
    const noise = ((px * 2654435761) >>> 16) & 0xFF
    const alpha = noise > 200 ? 8 : 0
    data[i] = 255
    data[i + 1] = 255
    data[i + 2] = 255
    data[i + 3] = alpha
  }
  tmpCtx.putImageData(imageData, 0, 0)
  ctx.drawImage(tmp, 0, 0)
}

function drawText(ctx, text, x, y, font, color, align = 'left', maxWidth) {
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  if (maxWidth) {
    ctx.fillText(text, x, y, maxWidth)
  } else {
    ctx.fillText(text, x, y)
  }
}

function drawStatRow(ctx, label, value, y, isPositive, isNegative) {
  const leftX = PAD + 8
  const rightX = CARD_W - PAD - 8

  drawText(ctx, label, leftX, y, '13px "DM Sans", sans-serif', 'rgba(232, 224, 208, 0.85)')

  let valueColor = '#e8e0d0'
  if (isPositive) valueColor = '#f0c850'
  if (isNegative) valueColor = '#e74c3c'
  drawText(ctx, value, rightX, y, '700 14px "Outfit", sans-serif', valueColor, 'right')
}

export function renderShareCard(state) {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')

  // Felt green background
  ctx.fillStyle = '#0c200c'
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // Radial spotlight
  const gradient = ctx.createRadialGradient(CARD_W / 2, CARD_H / 3, 0, CARD_W / 2, CARD_H / 3, CARD_W * 0.7)
  gradient.addColorStop(0, 'rgba(26, 90, 26, 0.4)')
  gradient.addColorStop(1, 'rgba(12, 32, 12, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // Deterministic grain
  drawGrain(ctx)

  // Gold border
  ctx.strokeStyle = '#d4a832'
  ctx.lineWidth = 3
  ctx.strokeRect(12, 12, CARD_W - 24, CARD_H - 24)

  // Inner border
  ctx.strokeStyle = 'rgba(212, 168, 50, 0.3)'
  ctx.lineWidth = 1
  ctx.strokeRect(20, 20, CARD_W - 40, CARD_H - 40)

  // Title
  drawText(ctx, 'BLACKJACK', CARD_W / 2, 60, '900 28px "Playfair Display", Georgia, serif', '#f0c850', 'center')

  // Tagline
  const tagline = getTagline(state.bankroll)
  drawText(ctx, tagline, CARD_W / 2, 84, 'italic 12px "DM Sans", sans-serif', 'rgba(232, 224, 208, 0.75)', 'center', CARD_W - 80)

  // Grade
  const grade = getGrade(state.bankroll)
  const gradeColor = state.bankroll >= 0 ? '#f0c850' : '#e74c3c'
  drawText(ctx, grade, CARD_W / 2, 150, '900 64px "Playfair Display", Georgia, serif', gradeColor, 'center')

  // Divider line
  ctx.beginPath()
  ctx.moveTo(PAD + 40, 175)
  ctx.lineTo(CARD_W - PAD - 40, 175)
  ctx.strokeStyle = 'rgba(212, 168, 50, 0.4)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Stats section
  const winRate = state.handsPlayed > 0
    ? ((state.handsWon / state.handsPlayed) * 100).toFixed(1) + '%'
    : '--'
  const netPnL = state.totalWon - state.totalLost
  const assetsRemaining = Object.values(state.ownedAssets).filter(Boolean).length
  const vigPercent = Math.round(getVigRate(state.bankroll) * 100) + '%'

  let y = 210
  const rowH = 28

  drawStatRow(ctx, 'Bankroll', formatMoney(state.bankroll), y, state.bankroll > 0, state.bankroll < 0); y += rowH
  drawStatRow(ctx, 'Hands Played', String(state.handsPlayed), y); y += rowH
  drawStatRow(ctx, 'Win Rate', winRate, y); y += rowH
  drawStatRow(ctx, 'Blackjacks', String(state.blackjackCount), y); y += rowH
  drawStatRow(ctx, 'Total Wagered', formatMoney(state.totalWagered), y); y += rowH

  y += 8 // section gap

  drawStatRow(ctx, 'Best Win Streak', String(state.bestWinStreak), y, true); y += rowH
  drawStatRow(ctx, 'Best Lose Streak', String(state.bestLoseStreak), y, false, true); y += rowH
  drawStatRow(ctx, 'Biggest Win', formatMoney(state.biggestWin), y, state.biggestWin > 0); y += rowH
  drawStatRow(ctx, 'Biggest Loss', formatMoney(state.biggestLoss), y, false, state.biggestLoss > 0); y += rowH

  y += 8

  drawStatRow(ctx, 'Total Won', formatMoney(state.totalWon), y, state.totalWon > 0); y += rowH
  drawStatRow(ctx, 'Total Lost', formatMoney(state.totalLost), y, false, state.totalLost > 0); y += rowH
  drawStatRow(ctx, 'Net P&L', formatMoney(netPnL), y, netPnL > 0, netPnL < 0); y += rowH

  y += 8

  drawStatRow(ctx, 'Peak Bankroll', formatMoney(state.peakBankroll), y, true); y += rowH
  drawStatRow(ctx, 'Rock Bottom', formatMoney(state.lowestBankroll), y, false, state.lowestBankroll < 0); y += rowH
  drawStatRow(ctx, 'Assets Remaining', `${assetsRemaining} / 6`, y); y += rowH
  drawStatRow(ctx, 'Vig Rate', vigPercent, y); y += rowH
  drawStatRow(ctx, 'Total Vig Paid', formatMoney(state.totalVigPaid), y, false, state.totalVigPaid > 0); y += rowH

  // Footer divider
  ctx.beginPath()
  ctx.moveTo(PAD + 40, CARD_H - 52)
  ctx.lineTo(CARD_W - PAD - 40, CARD_H - 52)
  ctx.strokeStyle = 'rgba(212, 168, 50, 0.3)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Footer
  drawText(ctx, 'blackjack.siaahmadi.com', CARD_W / 2, CARD_H - 28, '600 12px "DM Sans", sans-serif', 'rgba(232, 224, 208, 0.55)', 'center')

  return canvas
}

export async function shareStats(state) {
  const canvas = renderShareCard(state)

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  const file = new File([blob], 'blackjack-stats.png', { type: 'image/png' })

  // Try Web Share API (mobile)
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        title: 'My Blackjack Stats',
        files: [file],
      })
      return
    } catch {
      // User cancelled or share failed — fall through to download
    }
  }

  // Fallback: download PNG
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'blackjack-stats.png'
  a.click()
  URL.revokeObjectURL(url)
}
