import { useState, useCallback } from 'react'
import { MIN_BET } from '../constants/gameConfig'
import ChipTray from './ChipTray'
import AssetBetting from './AssetBetting'
import styles from './BettingControls.module.css'

function BettingControls({
  bankroll,
  selectedChipValue,
  chipStack,
  ownedAssets,
  bettedAssets,
  showAssetMenu,
  inDebtMode,
  onChipTap,
  onUndo,
  onClear,
  onAllIn,
  onDeal,
  onBetAsset,
  onToggleAssetMenu,
  onTakeLoan,
}) {
  const [allInCooldown, setAllInCooldown] = useState(false)

  const handleAllIn = useCallback(() => {
    if (allInCooldown) return
    onAllIn()
    setAllInCooldown(true)
    setTimeout(() => setAllInCooldown(false), 3000)
  }, [allInCooldown, onAllIn])

  const chipTotal = chipStack.reduce((sum, v) => sum + v, 0)
  const assetTotal = bettedAssets.reduce((sum, a) => sum + a.value, 0)
  const canDeal = (chipTotal + assetTotal) >= MIN_BET

  // Debt gate logic
  const hasOwnedAssets = Object.values(ownedAssets).some(v => v)
  const isChipTrayBlocked = bankroll <= 0 && !inDebtMode
  const showAssetGate = isChipTrayBlocked && hasOwnedAssets
  const showLoanGate = isChipTrayBlocked && !hasOwnedAssets

  const dealClasses = [
    styles.dealButton,
    !canDeal ? styles.disabled : '',
    bankroll < -10000 ? styles.wobble : '',
  ].filter(Boolean).join(' ')

  const allInClasses = [
    styles.allInButton,
    bankroll < 0 ? styles.hailMary : '',
    allInCooldown || isChipTrayBlocked ? styles.cooldown : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={styles.controls}>
      <div className={styles.chipTrayWrapper}>
        <ChipTray
          bankroll={bankroll}
          selectedChipValue={selectedChipValue}
          onChipTap={onChipTap}
          disabled={isChipTrayBlocked}
        />
        {showAssetGate && (
          <div className={styles.gateOverlay}>
            <button
              className={styles.assetGateButton}
              onClick={onToggleAssetMenu}
            >
              BET AN ASSET
            </button>
            <span className={styles.gateSubtext}>You're broke. Time for desperate measures.</span>
          </div>
        )}
        {showLoanGate && (
          <div className={styles.gateOverlay}>
            <button
              className={styles.loanGateButton}
              onClick={onTakeLoan}
            >
              TAKE A LOAN
            </button>
            <span className={styles.gateSubtext}>Interest applies. There's no going back.</span>
          </div>
        )}
      </div>
      <div className={styles.controlRow}>
        <button
          className={styles.smallButton}
          onClick={onUndo}
          disabled={chipStack.length === 0}
        >
          UNDO
        </button>
        <button
          className={styles.smallButton}
          onClick={onClear}
          disabled={chipStack.length === 0}
        >
          CLEAR
        </button>
        <button className={allInClasses} onClick={handleAllIn} disabled={allInCooldown || isChipTrayBlocked}>
          {bankroll < 0 ? 'HAIL MARY' : 'ALL IN'}
        </button>
      </div>
      {!showLoanGate && (
        <AssetBetting
          bankroll={bankroll}
          ownedAssets={ownedAssets}
          bettedAssets={bettedAssets}
          onBetAsset={onBetAsset}
          showAssetMenu={showAssetMenu}
          onToggleAssetMenu={onToggleAssetMenu}
        />
      )}
      <button
        className={dealClasses}
        onClick={canDeal ? onDeal : undefined}
      >
        DEAL
      </button>
    </div>
  )
}

export default BettingControls
