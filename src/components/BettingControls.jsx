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
  onChipTap,
  onUndo,
  onClear,
  onAllIn,
  onDeal,
  onBetAsset,
  onToggleAssetMenu,
}) {
  const chipTotal = chipStack.reduce((sum, v) => sum + v, 0)
  const assetTotal = bettedAssets.reduce((sum, a) => sum + a.value, 0)
  const canDeal = (chipTotal + assetTotal) >= MIN_BET

  const dealClasses = [
    styles.dealButton,
    !canDeal ? styles.disabled : '',
    bankroll < -10000 ? styles.wobble : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={styles.controls}>
      <ChipTray
        bankroll={bankroll}
        selectedChipValue={selectedChipValue}
        onChipTap={onChipTap}
      />
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
        <button className={`${styles.allInButton}${bankroll < 0 ? ` ${styles.hailMary}` : ''}`} onClick={onAllIn}>
          {bankroll < 0 ? 'HAIL MARY' : 'ALL IN'}
        </button>
      </div>
      <AssetBetting
        bankroll={bankroll}
        ownedAssets={ownedAssets}
        bettedAssets={bettedAssets}
        onBetAsset={onBetAsset}
        showAssetMenu={showAssetMenu}
        onToggleAssetMenu={onToggleAssetMenu}
      />
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
