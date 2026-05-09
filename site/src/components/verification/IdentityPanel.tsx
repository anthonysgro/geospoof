import * as React from "react"

import { LanguageField } from "./LanguageField"
import { LocalTimeField } from "./LocalTimeField"
import { LocationField } from "./LocationField"
import { PlatformField } from "./PlatformField"
import { TimezoneField } from "./TimezoneField"

/**
 * Identity Panel.
 *
 * Layout strategy (Req 21.1, Req 21.1a, Req 21.2):
 *   - Below 768px: single column stack. Location card first (map and
 *     coords), then the supporting sidebar.
 *   - 768px – 1024px: Location stacks above the sidebar; the sidebar
 *     lays out as two columns so each supporting field has room.
 *   - 1024px and up: asymmetric two-column grid — Location is the
 *     hero on the left with a prominent map, and the supporting fields
 *     (Timezone, Local time, Language, Platform) fill a compact sidebar
 *     on the right that matches the map's height.
 *
 * Putting Timezone / Local time / Language / Platform into one card
 * (with thin dividers at lg) — rather than four separate cards — lets
 * the content fill the sidebar vertically without leaving the dead
 * space we had when each field sat in its own card. Feature
 * availability was moved out of the panel entirely; it now lives in
 * the Browser_Capabilities collapsible below the Detectable_Issues
 * Section (Req 6, amended).
 *
 * The outer Location card and the sidebar card are each their own
 * `<dl>` (Req 18.1). Each field component renders its own
 * `<div role="group">` wrapping a `<dt>` and one or more `<dd>`, so
 * wrapping a group of fields in one `<dl>` keeps the semantics of a
 * description list intact.
 */
export default function IdentityPanel() {
  return (
    <section
      aria-label="Browser-reported identity"
      className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
    >
      {/* Location — hero card */}
      <dl className="rounded-xl border border-(--color-canvas-border) bg-(--color-canvas) p-5 shadow-sm md:p-6">
        <LocationField />
      </dl>

      {/* Supporting sidebar — one card, four sections */}
      <dl className="rounded-xl border border-(--color-canvas-border) bg-(--color-canvas) p-5 shadow-sm md:p-6">
        {/*
          Below lg: 2-column grid on md+ so the four short fields share
          the width rather than stacking into a tall narrow strip.
          At lg: single column with dividers between fields so the
          sidebar fills the map's height vertically.
        */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-1 lg:gap-0 lg:divide-y lg:divide-(--color-canvas-border)">
          <SidebarSection>
            <TimezoneField />
          </SidebarSection>
          <SidebarSection>
            <LocalTimeField />
          </SidebarSection>
          <SidebarSection>
            <LanguageField />
          </SidebarSection>
          <SidebarSection>
            <PlatformField />
          </SidebarSection>
        </div>
      </dl>
    </section>
  )
}

/**
 * Wrapper for a single sidebar field. Adds vertical padding at lg so
 * the divider produced by the parent's `lg:divide-y` has breathing
 * room; at narrower breakpoints the grid gap handles spacing instead.
 *
 * The first and last children get reduced top/bottom padding so the
 * card's own padding is not doubled.
 */
function SidebarSection({ children }: { children: React.ReactNode }) {
  return <div className="lg:py-5 lg:first:pt-0 lg:last:pb-0">{children}</div>
}
