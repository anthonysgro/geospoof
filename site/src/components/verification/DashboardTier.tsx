import * as React from "react"

interface DashboardTierProps {
  /** Stable DOM id for the tier heading — supports deep-links and aria-labelledby from child sections. */
  id: string
  /** Short tier title rendered as the visible h2. */
  title: string
  /**
   * One-sentence explanation of what lives in this tier. Rendered in
   * muted text below the title. Optional but recommended — signposts
   * the purpose of the tier at a glance.
   */
  subtitle?: string
  children: React.ReactNode
}

/**
 * Top-level organizational wrapper for the Verification Dashboard.
 *
 * The dashboard has three tiers — Identity, Verdict, Details — and each
 * gets one of these. The tier renders a visible h2 plus subtitle and a
 * children slot for the panels / sections that belong inside.
 *
 * Every child panel then uses h3 for its own heading, keeping a tidy
 * h1 → h2 → h3 descent down the page. The page route owns the single
 * h1 ("Verify your protection, privately").
 */
export function DashboardTier({
  id,
  title,
  subtitle,
  children,
}: DashboardTierProps) {
  return (
    <section id={id} aria-labelledby={id} className="space-y-5 scroll-mt-24">
      <header className="mx-auto w-full max-w-4xl space-y-1">
        <h2
          id={id}
          className="text-2xl font-semibold text-(--color-canvas-foreground)"
        >
          {title}
        </h2>
        {subtitle ? (
          <p className="text-sm text-(--color-canvas-muted)">{subtitle}</p>
        ) : null}
      </header>

      <div className="space-y-6">{children}</div>
    </section>
  )
}
