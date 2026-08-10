"use client"

import * as React from "react"

/** Ignore outside dismiss briefly after content mounts so the open-button click cannot close it. */
export const OUTSIDE_DISMISS_GUARD_MS = 400

export function useOutsideDismissGuard() {
  const mountedAtRef = React.useRef(0)

  React.useEffect(() => {
    mountedAtRef.current = Date.now()
  }, [])

  return React.useCallback(() => {
    return Date.now() - mountedAtRef.current < OUTSIDE_DISMISS_GUARD_MS
  }, [])
}

export function guardOutsideEvent<E extends { preventDefault: () => void }>(
  shouldBlock: () => boolean,
  handler?: (event: E) => void,
) {
  return (event: E) => {
    if (shouldBlock()) {
      event.preventDefault()
      return
    }
    handler?.(event)
  }
}
