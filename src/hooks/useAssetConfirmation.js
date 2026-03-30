import { useState, useCallback } from 'react'

export function useAssetConfirmation(dispatch, betAssetAction) {
  const [pendingAssetConfirm, setPendingAssetConfirm] = useState(null)

  const handleBetAsset = useCallback((asset) => {
    if (asset.id === 'house' || asset.id === 'soul') {
      setPendingAssetConfirm(asset)
    } else {
      dispatch(betAssetAction(asset))
    }
  }, [dispatch, betAssetAction])

  const handleConfirmAsset = useCallback(() => {
    if (pendingAssetConfirm) {
      dispatch(betAssetAction(pendingAssetConfirm))
      setPendingAssetConfirm(null)
    }
  }, [pendingAssetConfirm, dispatch, betAssetAction])

  const handleCancelAsset = useCallback(() => setPendingAssetConfirm(null), [])

  return { pendingAssetConfirm, handleBetAsset, handleConfirmAsset, handleCancelAsset }
}
