import { en } from "./dictionaries/en"
import { fr } from "./dictionaries/fr"
import { ru } from "./dictionaries/ru"
import { zhCN } from "./dictionaries/zh-CN"
import type { Locale } from "./config"
import type { Dictionary } from "./dictionaries/en"

export type { Dictionary } from "./dictionaries/en"
export * from "./config"

/** All dictionaries, keyed by locale. */
const dictionaries: Record<Locale, Dictionary> = { en, fr, ru, "zh-CN": zhCN }

/** Get the message dictionary for a locale. */
export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale]
}

/**
 * Interpolate `{name}` placeholders in a message string.
 *
 * `format("© {year} GeoSpoof", { year: 2026 })` -> "© 2026 GeoSpoof"
 */
export function format(
  message: string,
  values: Record<string, string | number>
): string {
  return message.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  )
}
