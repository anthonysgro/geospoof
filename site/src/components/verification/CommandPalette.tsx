import * as React from "react"
import { BookOpen, Play, Search, Target } from "lucide-react"

import type { TestState } from "@/lib/test-suite/types"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"

interface CommandPaletteProps {
  states: ReadonlyArray<TestState>
  onRunAgain: () => void
  isRunning: boolean
}

/**
 * Global command palette for the Verification Dashboard.
 *
 * Opens on Cmd+K / Ctrl+K anywhere on the page. Offers:
 *   - Quick actions: Run again, jump to a specific dashboard tier
 *   - Searchable list of all ~110 tests; selecting one scrolls to the
 *     test card, sets the URL hash, and the card listens to hashchange
 *     to auto-expand itself (TestGroup also auto-opens if it's collapsed)
 *
 * The palette never runs tests directly — it just navigates and
 * expands things. Actual "Run again" flows through the same handler
 * the Verdict card uses so the whole page stays in sync.
 */
export function CommandPalette({
  states,
  onRunAgain,
  isRunning,
}: CommandPaletteProps) {
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const navigateToTest = React.useCallback((testId: string): void => {
    // Setting `location.hash` fires a hashchange event that TestCard
    // and TestGroup listen for — they auto-expand in response. We
    // also scrollIntoView for good measure (browsers usually do this
    // for hash changes, but not always when the element is inside
    // a collapsed accordion that's just now opening).
    window.location.hash = `test-${testId}`
    // Delay the scroll by one frame so the group has a chance to
    // open first. scrollIntoView with smooth behavior handles the
    // rest.
    requestAnimationFrame(() => {
      const el = document.getElementById(`test-${testId}`)
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    })
    setOpen(false)
  }, [])

  const navigateToTier = React.useCallback((tierId: string): void => {
    const el = document.getElementById(tierId)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
    setOpen(false)
  }, [])

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search tests, run actions, jump to sections…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem
            value="run-again"
            disabled={isRunning}
            onSelect={() => {
              onRunAgain()
              setOpen(false)
            }}
          >
            <Play />
            <span>{isRunning ? "Running…" : "Run again"}</span>
            <CommandShortcut>R</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Jump to section">
          <CommandItem
            value="tier-identity"
            onSelect={() => navigateToTier("tier-identity")}
          >
            <Target />
            <span>Your identity</span>
          </CommandItem>
          <CommandItem
            value="tier-verdict"
            onSelect={() => navigateToTier("tier-verdict")}
          >
            <Target />
            <span>Verdict</span>
          </CommandItem>
          <CommandItem
            value="tier-details"
            onSelect={() => navigateToTier("tier-details")}
          >
            <Target />
            <span>Detectable issues</span>
          </CommandItem>
        </CommandGroup>

        {states.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Tests (${states.length})`}>
              {states.map((state) => (
                <CommandItem
                  key={state.definition.id}
                  // cmdk searches the `value` prop by default. Include
                  // id, name, group, and technique so any substring a
                  // user might type lands on the right row.
                  value={[
                    state.definition.id,
                    state.definition.name,
                    state.definition.group,
                    state.definition.technique,
                  ].join(" ")}
                  onSelect={() => navigateToTest(state.definition.id)}
                >
                  {state.result.status === "fail" ||
                  state.result.status === "error" ? (
                    <Search className="text-destructive" />
                  ) : (
                    <BookOpen />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm">
                      {state.definition.name}
                    </span>
                    <span className="truncate font-mono text-[10px] text-muted-foreground">
                      {state.definition.id}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  )
}
