import React, { useState, useCallback, useRef, useEffect } from 'react'
import { TABLE_LEVELS } from '../constants/tableLevels'
import { ASSETS } from '../constants/assets'
import { sumChipStack } from '../utils/chipUtils'
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
  tableLevel = 0,
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
  const cooldownRef = useRef(null)

  useEffect(() => {
    return () => clearTimeout(cooldownRef.current)
  }, [])

  const handleAllIn = useCallback(() => {
    if (allInCooldown) return
    onAllIn()
    setAllInCooldown(true)
    clearTimeout(cooldownRef.current)
    cooldownRef.current = setTimeout(() => setAllInCooldown(false), 3000)
  }, [allInCooldown, onAllIn])

  const chipTotal = sumChipStack(chipStack)
  const assetTotal = bettedAssets.reduce((sum, a) => sum + a.value, 0)
  const canDeal = (chipTotal + assetTotal) >= TABLE_LEVELS[tableLevel].minBet

  // Debt gate logic — check assets that are owned OR actively betted, AND unlocked at current bankroll
  const hasAvailableAssets = ASSETS.some(
    a => bankroll <= a.unlockThreshold && ownedAssets[a.id] && !bettedAssets.some(b => b.id === a.id)
  )
  const minBet = TABLE_LEVELS[tableLevel].minBet
  const isChipTrayBlocked = bankroll < minBet && !inDebtMode
  const showAssetGate = isChipTrayBlocked && hasAvailableAssets
  const showLoanGate = isChipTrayBlocked && !hasAvailableAssets

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
          tableLevel={tableLevel}
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

export default React.memo(BettingControls)
