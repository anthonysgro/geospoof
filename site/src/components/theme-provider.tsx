import * as React from "react"

type Theme = "light" | "dark" | "system"

interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

interface ThemeProviderState {
  theme: Theme
  resolvedTheme: "light" | "dark"
  setTheme: (theme: Theme) => void
}

const ThemeProviderContext = React.createContext<
  ThemeProviderState | undefined
>(undefined)

const STORAGE_KEY = "geospoof-theme"

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

function getStoredTheme(storageKey: string): Theme | null {
  if (typeof window === "undefined") return null
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored === "light" || stored === "dark" || stored === "system")
      return stored
    return null
  } catch {
    return null
  }
}

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") return getSystemTheme()
  return theme
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = STORAGE_KEY,
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window === "undefined") return defaultTheme
    const stored = getStoredTheme(storageKey)
    if (stored) return stored
    return defaultTheme
  })

  const [resolvedTheme, setResolvedTheme] = React.useState<"light" | "dark">(
    () => {
      if (typeof window === "undefined") return resolveTheme(defaultTheme)
      const isDark = document.documentElement.classList.contains("dark")
      return isDark ? "dark" : "light"
    }
  )

  const applyTheme = React.useCallback((resolved: "light" | "dark") => {
    if (typeof window === "undefined") return
    const root = document.documentElement
    if (resolved === "dark") {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }
    setResolvedTheme(resolved)
  }, [])

  const setTheme = React.useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme)
      try {
        localStorage.setItem(storageKey, newTheme)
      } catch {
        // localStorage unavailable
      }
      applyTheme(resolveTheme(newTheme))
    },
    [storageKey, applyTheme]
  )

  // Listen for system preference changes when theme is 'system'
  React.useEffect(() => {
    if (theme !== "system") return
    const mql = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => applyTheme(getSystemTheme())
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [theme, applyTheme])

  // Sync on mount
  React.useEffect(() => {
    applyTheme(resolveTheme(theme))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  )

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export function useTheme(): ThemeProviderState {
  const context = React.useContext(ThemeProviderContext)
  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")
  return context
}

export { ThemeProviderContext }
