import { useEffect, useRef } from 'react'

export function usePrevious(value) {
  const ref = useRef(value)
  // eslint-disable-next-line react-hooks/refs -- intentional: capture previous value during render before effects update ref
  const prev = ref.current
  useEffect(() => {
    ref.current = value
  })
  return prev
}
