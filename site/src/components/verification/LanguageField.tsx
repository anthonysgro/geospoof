import { useIdentity } from "@/lib/verification/identity-context"

/**
 * Language and locale field of the Identity Panel.
 *
 * Reads from the shared snapshot so the displayed values match anything
 * the Values Correctness / Internal Consistency tests might assert
 * against (Req 13.2, 23.2).
 */
export function LanguageField() {
  const { snapshot } = useIdentity()
  const { language } = snapshot

  const primary = language.primary || "—"
  const secondaryList = language.all.length > 0 ? language.all.join(", ") : null
  const intlLocale = language.intlLocale

  return (
    <div role="group" aria-labelledby="id-language-label">
      <dt
        id="id-language-label"
        className="text-sm font-medium text-(--color-canvas-foreground)"
      >
        Language
      </dt>
      <dd className="mt-2 font-mono text-base text-(--color-canvas-foreground)">
        {primary}
      </dd>
      {secondaryList ? (
        <dd className="mt-1 text-xs text-(--color-canvas-muted)">
          <span>All: </span>
          <span className="font-mono">{secondaryList}</span>
        </dd>
      ) : null}
      {intlLocale ? (
        <dd className="mt-1 text-xs text-(--color-canvas-muted)">
          Intl locale:{" "}
          <span className="font-mono text-(--color-canvas-foreground)">
            {intlLocale}
          </span>
        </dd>
      ) : null}
    </div>
  )
}
