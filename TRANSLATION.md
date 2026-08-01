# Translation guidance

Read this before translating the native app's String Catalog
(`safari/Shared (App)/Resources/Localizable.xcstrings`).

It exists as its own file, rather than as a section of `AGENTS.md` or a steering
doc, so it is not loaded as context during unrelated work — the pattern Apple
recommends in [WWDC26 session 213](https://developer.apple.com/videos/play/wwdc2026/213/).

**The single most important rule:** GeoSpoof's browser extension popup is
already translated into the same 11 non-English languages. The native app and
the popup are two views of one product, and a user moving between them must see
the same word for the same feature. The glossary below is not a suggestion —
those translations already ship, and re-deriving them creates two vocabularies
for one product.

## Scope

- **In scope:** `safari/Shared (App)/Resources/Localizable.xcstrings`, the single
  catalog shared by the iOS app, the macOS app, and the widget.
- **Not in scope:** `_locales/*/messages.json` (the extension popup — already
  translated, and the source of the glossary here), `site/src/lib/i18n/`
  (the marketing site), and anything under `safari/` that is not the catalog.
- Do not add `InfoPlist.xcstrings` files. The only localizable `Info.plist` keys
  are `CFBundleDisplayName`, `CFBundleName`, and `NSHumanReadableCopyright`, and
  every value is a product name — see "Never translate" below.

## Never translate

Leave these exactly as written, in every language, including scripts that would
normally transliterate:

- **GeoSpoof**, **GeoSpoof Pro**, **GeoSpoof GPS**, **GeoSpoof Widget**
- **Safari**, **Apple**, **App Store**, **Apple Account**, **TestFlight**
- **iPhone**, **iPad**, **Mac**, **iOS**, **macOS**
- VPN provider names (**Proton VPN**, **Mullvad**, **NordVPN**, and any others)
- **WebRTC**, **VPN**, **GPS**, **IP**, **UTC**, **DST**
- **Allowlist** / **Denylist** _as feature names_ — but see the glossary, which
  gives the established per-language rendering. Follow the glossary over this
  line where they conflict.

Also never translate values that are data rather than copy. These are already
excluded from the catalog by construction — the code renders them through
`Text(verbatim:)` — so they should not appear as keys at all. If you encounter
one as a key, that is a bug in the Swift code, not something to translate:

- IANA timezone identifiers (`Europe/Paris`), BCP 47 language tags (`pt-BR`)
- Coordinates, IP addresses, version strings
- SF Symbol names (`checkmark.shield.fill`), asset catalog names
- JavaScript API identifiers (`navigator.geolocation.getCurrentPosition()`)
- City and country names (they come from `cities.json`)
- Placeholder domains (`example.com`)

## Voice and tone

GeoSpoof is a privacy utility for technically literate people. The English copy
is plain, direct, and unhedged, and it explains consequences rather than
promising outcomes. Match that register:

- Prefer the plain equivalent over the formal or marketing one. Where a language
  distinguishes formal and informal address, use the register Apple's own system
  UI uses for that language (for example `Sie` in German, `vous` in French).
- Keep sentences short. The English is short because the UI is dense; a
  translation that doubles the length will truncate. See "Length" below.
- Do not add enthusiasm the English does not have. No exclamation marks unless
  the source has one.
- Technical accuracy outranks fluency. "Spoofing" means presenting false data to
  websites; do not soften it to "hiding" or "protecting" — the glossary's
  established renderings already make this choice per language.

## Length

Text is the tightest constraint in this app. Two surfaces truncate readily:

- **The widget**, at its smallest family — text cannot scroll and cannot wrap far.
- **`SpoofControlPanel`**, the main settings list, where each row is a label plus
  a trailing value on one line.

German is the worst case among the supported languages and is translated first
for exactly that reason. If a translation cannot be shortened without losing
meaning, say so rather than silently truncating the meaning — the layout can be
changed, and that is the preferred fix.

## Format specifiers

Keys contain `%lld` (an integer), `%@` (a string), and `%%` (a literal percent).

- Keep every specifier, and keep them the same type. Dropping or retyping one
  will crash or render garbage at runtime.
- **You may reorder them.** Xcode automatically rewrites multi-placeholder
  strings with positional specifiers (`%1$lld`, `%2$@`) precisely so the order
  can differ per language. Use that where the target language needs a different
  clause order.
- Do not translate the units or symbols attached to a number where they are
  standard: `km`, `m`, `%`. Do translate `min` (minutes) and `/mo` (per month),
  which are English abbreviations.
- Numbers interpolated with `%lld` are formatted through the display locale
  automatically, including grouping separators. Do not add grouping to the
  format string.

## Leading and trailing whitespace is significant

Four keys carry deliberate padding. It is load-bearing — these strings are
concatenated with an adjacent icon or sentence at runtime, so trimming the space
runs the words together. Preserve the whitespace exactly, at the same end:

| Key                                                                  | Why the space is there                                                        |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `  No account · No tracking · Open source`                           | Two leading spaces separate it from a preceding SF Symbol in the same `Text`. |
| `  One purchase unlocks iPhone, iPad & Mac`                          | Same — leading icon.                                                          |
| ` Choose Allowlist or Denylist to limit spoofing to specific sites.` | One leading space; appended after another complete sentence.                  |
| `Step %lld: `                                                        | Trailing space; a VoiceOver numbering prefix followed by the step caption.    |

Most editors and many translation tools trim silently. Check these four
specifically after any round trip.

## Plurals

Where a language needs plural variations that English does not, add them. Xcode
supplies the set of categories each language requires. Do not approximate a
language's plural rules with English's two-form shape.

The English source has a small number of integer-bearing strings
(`%lld days free, then %@/year. Cancel anytime.`, `Allowlist · %lld`) that read
as singular-agnostic in English but need real plural handling in several
languages. Treat those as plural candidates rather than copying the shape.

## Platform conventions vs the popup

The native app follows Apple's capitalization conventions and the popup follows
web ones, so a few strings differ in English between the two. This is deliberate
and the difference should be preserved per language, following whatever that
language's Apple system UI does:

| Concept                       | Native app      | Popup           |
| ----------------------------- | --------------- | --------------- |
| Blocked sites section heading | `Blocked Sites` | `Blocked sites` |
| Allowed sites section heading | `Allowed Sites` | `Allowed sites` |

Many languages (German, French, Spanish, Russian, Japanese, Chinese) do not use
English-style title case at all, so these will often be identical once
translated. That is correct — do not invent a distinction the language lacks.

## Glossary — established per-language terms

These already ship in the extension popup. **Reuse them verbatim.** The
`_locales` key is given so the source can be checked; the file is
`_locales/<code>/messages.json`.

**`Location Accuracy`** — `_locales` key `advanced_accuracy`

- `de` — Standortgenauigkeit
- `es` — Precisión de ubicación
- `fr` — Précision de localisation
- `id` — Akurasi Lokasi
- `ja` — 位置情報の精度
- `nl` — Locatienauwkeurigheid
- `pt-BR` — Precisão da localização
- `ru` — Точность местоположения
- `sv` — Platsnoggrannhet
- `vi` — Độ chính xác vị trí
- `zh-Hans` — 位置精度

**`Accuracy`** — `_locales` key `details_accuracyLabel`

- `de` — Genauigkeit
- `es` — Precisión
- `fr` — Précision
- `id` — Akurasi
- `ja` — 精度
- `nl` — Nauwkeurigheid
- `pt-BR` — Precisão
- `ru` — Точность
- `sv` — Noggrannhet
- `vi` — Độ chính xác
- `zh-Hans` — 精度

**`Realistic`** — `_locales` key `advanced_accuracy_realistic`

- `de` — Realistisch
- `es` — Realista
- `fr` — Réaliste
- `id` — Realistis
- `ja` — 現実的
- `nl` — Realistisch
- `pt-BR` — Realista
- `ru` — Реалистичная
- `sv` — Realistisk
- `vi` — Thực tế
- `zh-Hans` — 真实

**`Site Filters`** — `_locales` key `filters_heading`

- `de` — Website-Filter
- `es` — Filtros de sitios
- `fr` — Filtres de sites
- `id` — Filter Situs
- `ja` — サイトフィルター
- `nl` — Sitefilters
- `pt-BR` — Filtros de sites
- `ru` — Фильтры сайтов
- `sv` — Webbplatsfilter
- `vi` — Bộ lọc trang web
- `zh-Hans` — 网站筛选

**`Allowlist`** — `_locales` key `filters_modeAllowlist`

- `de` — Zulassungsliste
- `es` — Lista de permitidos
- `fr` — Liste d'autorisation
- `id` — Daftar izin
- `ja` — 許可リスト
- `nl` — Toestaan
- `pt-BR` — Lista de permissões
- `ru` — Белый список
- `sv` — Tillåtlista
- `vi` — Cho phép
- `zh-Hans` — 允许列表

**`Denylist`** — `_locales` key `filters_modeDenylist`

- `de` — Sperrliste
- `es` — Lista de bloqueados
- `fr` — Liste de blocage
- `id` — Daftar blokir
- `ja` — 拒否リスト
- `nl` — Blokkeren
- `pt-BR` — Lista de bloqueio
- `ru` — Чёрный список
- `sv` — Blocklista
- `vi` — Chặn
- `zh-Hans` — 拒绝列表

**`Spoofing applies to every site.`** — `_locales` key `filters_modeAllDesc`

- `de` — Die Fälschung gilt für jede Website.
- `es` — La suplantación se aplica a todos los sitios.
- `fr` — L'usurpation s'applique à tous les sites.
- `id` — Pemalsuan berlaku untuk setiap situs.
- `ja` — 偽装はすべてのサイトに適用されます。
- `nl` — Spoofing geldt voor elke site.
- `pt-BR` — A falsificação se aplica a todos os sites.
- `ru` — Подмена применяется ко всем сайтам.
- `sv` — Förfalskning gäller alla webbplatser.
- `vi` — Giả mạo áp dụng cho mọi trang web.
- `zh-Hans` — 伪装适用于所有网站。

**`Spoofing applies only to listed sites.`** — `_locales` key `filters_modeAllowlistDesc`

- `de` — Die Fälschung gilt nur für aufgelistete Websites.
- `es` — La suplantación se aplica solo a los sitios listados.
- `fr` — L'usurpation s'applique uniquement aux sites listés.
- `id` — Pemalsuan hanya berlaku untuk situs yang terdaftar.
- `ja` — 偽装はリストに登録されたサイトのみに適用されます。
- `nl` — Spoofing geldt alleen voor vermelde sites.
- `pt-BR` — A falsificação se aplica apenas aos sites listados.
- `ru` — Подмена применяется только к перечисленным сайтам.
- `sv` — Förfalskning gäller endast listade webbplatser.
- `vi` — Giả mạo chỉ áp dụng cho các trang web trong danh sách.
- `zh-Hans` — 伪装仅适用于列出的网站。

**`Spoofing applies to every site except listed ones.`** — `_locales` key `filters_modeDenylistDesc`

- `de` — Die Fälschung gilt für jede Website außer den aufgelisteten.
- `es` — La suplantación se aplica a todos los sitios excepto los listados.
- `fr` — L'usurpation s'applique à tous les sites sauf ceux listés.
- `id` — Pemalsuan berlaku untuk setiap situs kecuali yang terdaftar.
- `ja` — 偽装はリストに登録されたサイトを除くすべてのサイトに適用されます。
- `nl` — Spoofing geldt voor elke site behalve de vermelde.
- `pt-BR` — A falsificação se aplica a todos os sites, exceto os listados.
- `ru` — Подмена применяется ко всем сайтам, кроме перечисленных.
- `sv` — Förfalskning gäller alla webbplatser utom de listade.
- `vi` — Giả mạo áp dụng cho mọi trang web trừ các trang trong danh sách.
- `zh-Hans` — 伪装适用于除列出网站之外的所有网站。

**`Spoofed Location`** — `_locales` key `details_spoofedLocation`

- `de` — Vorgetäuschter Standort
- `es` — Ubicación falsificada
- `fr` — Localisation usurpée
- `id` — Lokasi Palsu
- `ja` — 偽装された位置
- `nl` — Vervalste locatie
- `pt-BR` — Localização falsificada
- `ru` — Подменённое местоположение
- `sv` — Förfalskad plats
- `vi` — Vị trí giả mạo
- `zh-Hans` — 伪造的位置

**`Spoofed Timezone`** — `_locales` key `details_spoofedTimezone`

- `de` — Vorgetäuschte Zeitzone
- `es` — Zona horaria falsificada
- `fr` — Fuseau horaire usurpé
- `id` — Zona Waktu Palsu
- `ja` — 偽装されたタイムゾーン
- `nl` — Vervalste tijdzone
- `pt-BR` — Fuso horário falsificado
- `ru` — Подменённый часовой пояс
- `sv` — Förfalskad tidszon
- `vi` — Múi giờ giả mạo
- `zh-Hans` — 伪造的时区

**`Re-sync`** — `_locales` key `vpnSync_resync`

- `de` — Erneut synchronisieren
- `es` — Resincronizar
- `fr` — Resynchroniser
- `id` — Sinkronkan ulang
- `ja` — 再同期
- `nl` — Opnieuw sync.
- `pt-BR` — Ressincronizar
- `ru` — Пересинхронизировать
- `sv` — Synka om
- `vi` — Đồng bộ lại
- `zh-Hans` — 重新同步

## Terms with no existing translation — originate these

These are core feature names in the native app, but the popup has **not** been
translated for them either: the keys exist only in `_locales/en/messages.json`
(see "Known gap" below). There is no established rendering to reuse, so you are
setting the precedent for this vocabulary in every language.

Translate these first and deliberately, then stay consistent with your own
choice everywhere it recurs:

| Native string          | Notes for the translator                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Reported Language`    | The language GeoSpoof makes _websites_ think the user speaks. It is **not** the app's own display language, and must not be confused with it — that distinction is the entire point of the feature. Prefer a rendering closer to "language reported to sites" than to "language setting" if the short form would be ambiguous.                                                                   |
| `Match Location`       | A mode of Reported Language: derive the reported language from the spoofed location. The popup's English is `Match my location` (`advanced_locale_match`); the native form is shorter because it sits in a settings row.                                                                                                                                                                         |
| `Location Precision`   | How far the reported point is _moved_ from the chosen one. Distinct from `Location Accuracy`, which is the uncertainty _figure_ sent alongside coordinates and moves nothing. Many languages use one word ("precision"/"accuracy") for both — you must find two distinguishable terms, because the app shows both settings on the same screen and a user who confuses them will misconfigure it. |
| `Exact`                | The Location Precision setting that does not move the point.                                                                                                                                                                                                                                                                                                                                     |
| `Street (~0.5 km)`     | Location Precision preset. Keep the `~` and the `km` value.                                                                                                                                                                                                                                                                                                                                      |
| `Neighborhood (~2 km)` | Location Precision preset.                                                                                                                                                                                                                                                                                                                                                                       |
| `City (~10 km)`        | Location Precision preset.                                                                                                                                                                                                                                                                                                                                                                       |

The `Location Precision` vs `Location Accuracy` pair is the highest-risk item in
this document. If the target language cannot distinguish them naturally, use a
descriptive phrase for one rather than letting both collapse to the same word.

## Known gap in the popup translations

`_locales/en/messages.json` has 177 keys; every other locale has 154. **23 keys
are English-only**, so the popup currently shows English for those strings in all
11 other languages. They are almost entirely the two newest features:

- All 11 `advanced_locale*` keys (Reported Language)
- All 7 `advanced_precision*` keys (Location Precision)
- `advanced_verbosity_error`, `advanced_verbosity_warn`
- `details_section_locale` (`Language & Locale`)
- `tab_settings`, `tab_settings_ariaLabel`

This is a pre-existing gap in the extension, not something introduced by the
native localization work. The locale parity test in
`tests/unit/locales.unit.test.ts` only _warns_ on missing keys (it fails only on
extra keys and placeholder mismatches), which is why it never surfaced.

Two consequences:

1. For the terms above, there is nothing to reuse — see "originate these".
2. Once the native app has translations for this vocabulary, the popup's 23
   missing keys should be backfilled **from the native catalog**, so the two stay
   aligned. Doing it in that direction rather than the reverse means the
   terminology is decided once, with the benefit of the context Xcode gives the
   translator about how each string is used.

## After translating

- Run the app in the target language to check for truncation and clipping. In
  Xcode: Product ▸ Scheme ▸ Edit Scheme ▸ Run ▸ Options ▸ App Language.
- Machine-translated strings carry the `leveraged-mt` state qualifier on export,
  so reviewed and unreviewed translations stay distinguishable.
- Native-speaker review happens through TestFlight. Nothing in this file
  substitutes for it — it exists to make the first pass consistent, not correct.
