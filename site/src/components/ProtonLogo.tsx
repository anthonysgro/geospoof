import { cn } from "@/lib/utils"

/**
 * Official Proton VPN logotype, self-hosted (SVGs in `/public/proton`).
 *
 * Renders the colored variant on light themes and the white variant on dark,
 * swapped purely in CSS via the `dark:` variant. Because the `.dark` class is
 * applied before paint (see the theme script in `__root.tsx`), there's no
 * hydration flash and no JS dependency. The hidden variant is `display:none`,
 * so screen readers only ever announce the visible one.
 *
 * Per Proton's brand guidelines the marks are used unmodified — no recolor or
 * distortion; only transparent padding was trimmed from the original viewBox.
 * We display Proton's brand because we recommend them; it does not imply Proton
 * endorses or is affiliated with GeoSpoof.
 */
export function ProtonLogo({ className }: { className?: string }) {
  const shared = "w-auto select-none"
  return (
    <>
      <img
        src="/proton/proton-vpn-logotype-colored.svg"
        alt="Proton VPN"
        width={3506}
        height={708}
        loading="lazy"
        decoding="async"
        className={cn(shared, "dark:hidden", className)}
      />
      <img
        src="/proton/proton-vpn-logotype-white.svg"
        alt="Proton VPN"
        width={3506}
        height={708}
        loading="lazy"
        decoding="async"
        className={cn(shared, "hidden dark:block", className)}
      />
    </>
  )
}
