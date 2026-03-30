import { useEffect, useRef } from 'react'
import audioManager from '../utils/audioManager'

export function useAudioInit() {
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    const handler = () => {
      audioManager.init()
      initRef.current = true
      document.removeEventListener('pointerdown', handler)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [])
}
