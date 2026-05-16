# Translations

GeoSpoof uses the [WebExtensions i18n API][i18n] for localization. Strings
live in `_locales/<lang>/messages.json` and are referenced from the popup
by key via `browser.i18n.getMessage()`.

[i18n]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/i18n

## Current status

| Locale  | Language             | Status                                      |
| ------- | -------------------- | ------------------------------------------- |
| `en`    | English              | ✅ Source of truth                          |
| `ru`    | Russian              | ✅ Reviewed                                 |
| `es`    | Spanish              | ⚠️ Machine-translated — needs native review |
| `pt_BR` | Brazilian Portuguese | ⚠️ Machine-translated — needs native review |
| `de`    | German               | ⚠️ Machine-translated — needs native review |
| `fr`    | French               | ⚠️ Machine-translated — needs native review |
| `zh_CN` | Simplified Chinese   | ⚠️ Machine-translated — needs native review |
| `ja`    | Japanese             | ⚠️ Machine-translated — needs native review |

Files marked machine-translated were produced by an LLM and intentionally
merged without native review because any localization is better than none
for first-time users. Review PRs are welcome.

## Helping translate

1. Read `_locales/en/messages.json` end-to-end. The `description` field on
   each entry explains what the string is and where it appears.
2. Open the matching `_locales/<lang>/messages.json` and edit the `message`
   values only. Do not rename keys or remove entries.
3. Keep `$1`, `$IP$`, `$MINUTES$`, and other placeholders intact. They get
   substituted at runtime.
4. Keep product names (`GeoSpoof`, `WebRTC`, `VPN`, `ICE`, `RTCPeerConnection`,
   `IP`) untranslated.
5. Popup width is fixed at 350px. Toggle labels longer than ~22 characters
   may truncate. If your language needs a longer label, shorten the phrase
   rather than overflow.
6. Remove the `⚠️ MACHINE-TRANSLATED` marker from the `extensionName`
   entry's `description` field once a native speaker has reviewed every
   key in the file.

## Adding a new language

1. Copy `_locales/en/messages.json` to `_locales/<lang>/messages.json`
   using the [Chrome locale codes][codes] (two-letter ISO 639-1, or
   underscore-separated variants like `pt_BR`, `zh_CN`, `zh_TW`).
2. Translate every `message` value, leaving `description` untouched.
3. Run `npm run validate:locales` to confirm key parity with `en`.
4. Add a row to the status table above.

[codes]: https://developer.chrome.com/docs/extensions/reference/api/i18n#locales

## Testing a locale locally

### Firefox

Launch Firefox with the locale pre-set so extensions resolve to it on load:

```
npm run build:firefox
web-ext run --source-dir dist \
  --pref intl.locale.requested=ru \
  --pref intl.multilingual.enabled=true
```

Note: Firefox caches the extension locale at load time. Changing
`intl.locale.requested` after the extension is running requires a
reload via `about:debugging` → Reload.

### Chrome / Chromium

```
npm run build:chromium
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --lang=ru
```

### Safari

Change System Settings → Language & Region → Preferred Languages, then
restart Safari.

## Validation

Every `_locales/<lang>/messages.json` is checked by
`tests/unit/locales.unit.test.ts` as part of the normal test suite
(`npm test`). The test asserts that every translation:

- Parses as valid JSON
- Contains every key present in `_locales/en/messages.json`
- Preserves the same `$PLACEHOLDER$` references the source uses
- Does not introduce keys not in the source

Extra keys and placeholder mismatches fail the test. Missing keys are
logged but don't fail, since they fall back to English at runtime.
