import * as React from "react"

export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(() => {
    if (typeof window === "undefined") return false
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  })

  React.useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)")
    const handler = (e: MediaQueryListEvent) =>
      setPrefersReducedMotion(e.matches)
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [])

  return prefersReducedMotion
}
