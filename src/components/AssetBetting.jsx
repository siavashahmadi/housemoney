import { memo } from 'react'
import { ASSETS } from '../constants/assets'
import { formatMoney } from '../utils/formatters'
import styles from './AssetBetting.module.css'

function AssetBetting({
  bankroll,
  ownedAssets,
  bettedAssets,
  onBetAsset,
  showAssetMenu,
  onToggleAssetMenu,
}) {
  const availableAssets = ASSETS.filter(
    a => bankroll <= a.unlockThreshold && ownedAssets[a.id] && !bettedAssets.some(b => b.id === a.id)
  )

  const hasUnlockedAssets = ASSETS.some(a => bankroll <= a.unlockThreshold && ownedAssets[a.id])
  if (!hasUnlockedAssets) return null

  return (
    <div className={styles.container}>
      <button className={styles.toggle} onClick={onToggleAssetMenu}>
        <span className={styles.toggleLabel}>DESPERATE MEASURES</span>
        <span className={styles.toggleCount}>{availableAssets.length}</span>
        <span className={`${styles.arrow} ${showAssetMenu ? styles.arrowOpen : ''}`}>&#9662;</span>
      </button>
      {showAssetMenu && (
        <div className={styles.list}>
          {availableAssets.length === 0 ? (
            <div className={styles.empty}>No assets available</div>
          ) : (
            availableAssets.map(asset => (
              <button
                key={asset.id}
                className={styles.assetRow}
                onClick={() => onBetAsset(asset)}
              >
                <span className={styles.emoji}>{asset.emoji}</span>
                <span className={styles.name}>{asset.name}</span>
                <span className={styles.value}>{formatMoney(asset.value)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default memo(AssetBetting)
