/**
 * Locale ("Reported Language") overrides.
 *
 * Makes every locale-bearing JS surface report the spoofed tag instead of the
 * browser's real one:
 *
 *   - `navigator.language` / `navigator.languages`
 *   - The DEFAULT locale of the `Intl` constructors that have no override of
 *     their own: `NumberFormat`, `Collator`, `RelativeTimeFormat`, `ListFormat`,
 *     `PluralRules`, `DisplayNames`, `Segmenter`, `DurationFormat`
 *   - `Number` / `BigInt` / `Array.prototype.toLocaleString`,
 *     `String.prototype.localeCompare`, `toLocaleUpperCase`, `toLocaleLowerCase`
 *
 * `Intl.DateTimeFormat` and `Date.prototype.toLocale*` are deliberately NOT
 * handled here. They already have overrides that inject the spoofed `timeZone`
 * (`timezone-overrides.ts` and `date-formatting.ts`), and those same wrappers
 * were extended to inject the locale too. Wrapping them a second time from this
 * module would stack two `stripConstruct` layers and let the locale and timezone
 * axes drift apart; one wrapper resolving both is the only way they cannot fight.
 *
 * ── The central design rule ─────────────────────────────────────────────────
 *
 * We INJECT the spoofed tag into the engine's own native constructor and return
 * the engine's result. We never post-process formatted output. Because ICU then
 * derives everything downstream from that tag, the decimal separator, grouping,
 * month and weekday names, collation order, `hourCycle`, `calendar`, and
 * `numberingSystem` are all genuinely correct for the reported locale. Faking
 * each derived value individually is precisely how a fingerprinter catches a
 * spoof: some value it checks disagrees with the claimed tag.
 *
 * ── Explicit arguments always win ───────────────────────────────────────────
 *
 * When a caller passes an explicit `locales` argument we leave it completely
 * alone, mirroring the explicit-`timeZone` precedent in the DateTimeFormat
 * override. A page asking for `de-DE` formatting must get `de-DE`; only the
 * *default* (caller passed nothing) is the browser-locale leak we are closing.
 *
 * Realm-parameterized like the Date/Intl installers so the top-level realm and
 * every same-origin iframe realm share one implementation, each capturing and
 * falling back to its own natives.
 */

import { spoofingEnabled, localeData } from "./state";
import {
  installOverride,
  installScrubbedAccessor,
  stripExtensionFramesFromStack,
} from "./function-masking";
import { seedFromBootstrap } from "./bootstrap";
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("INJ");

/**
 * The tag to report, or `null` when the real locale should be reported.
 *
 * Every locale override funnels through here, which makes it the one place the
 * document_start race needs closing. `seedFromBootstrap()` applies the settings
 * the Firefox bootstrap userScript inlined *before* the page's first script ran,
 * so a page that reads `navigator.language` at the top of `<head>` — the same
 * aggressive pattern that motivated the timezone bootstrap — gets the spoofed
 * value on the calling line instead of the real one. Without this the locale
 * surfaces would lag the timezone surfaces by a settings round-trip, and a page
 * could catch a spoofed zone next to a real language.
 *
 * Cheap to call on the hot path: the seed early-returns once consumed or once
 * the authoritative settings event has landed. No-op on Chrome/Safari, which
 * have no bootstrap global.
 */
function activeTag(): string | null {
  seedFromBootstrap();
  return spoofingEnabled && localeData ? localeData.tag : null;
}

/**
 * The language list to report, or `null` to report the real one. Seeds from the
 * bootstrap for the same reason {@link activeTag} does — `navigator.languages` is
 * read just as early as `navigator.language`, so it must not lag behind it.
 */
function activeLanguages(): readonly string[] | null {
  seedFromBootstrap();
  return spoofingEnabled && localeData ? localeData.languages : null;
}

/**
 * Resolve the `locales` argument to hand the native implementation.
 *
 * Returns the caller's value untouched whenever they supplied one; substitutes
 * the spoofed tag only for the default case. `null` is meaningful in the Intl
 * spec (it coerces to the string "null" and throws), so only `undefined` counts
 * as "caller passed nothing".
 *
 * Exported because `timezone-overrides.ts` (`Intl.DateTimeFormat`) and
 * `date-formatting.ts` (`Date.prototype.toLocale*`) inject the locale inside
 * their own existing wrappers rather than being wrapped again here. Sharing this
 * one function is what keeps "explicit caller locales always win" identical
 * across all of them instead of three near-copies that could drift.
 */
export function resolveEffectiveLocales(
  locales: string | string[] | undefined
): string | string[] | undefined {
  if (locales !== undefined) return locales;
  return activeTag() ?? undefined;
}

// ── Intl constructors ────────────────────────────────────────────────────────

/**
 * The `Intl` constructors this module owns.
 *
 * `DateTimeFormat` is absent on purpose — see the module header. Every entry is
 * feature-detected at install time, so an engine missing `DurationFormat` (or
 * any future addition) simply skips it without affecting the others.
 */
const INTL_CONSTRUCTORS = [
  "NumberFormat",
  "Collator",
  "RelativeTimeFormat",
  "ListFormat",
  "PluralRules",
  "DisplayNames",
  "Segmenter",
  "DurationFormat",
] as const;

/** Minimal constructor shape shared by every Intl constructor we wrap. */
type IntlCtor = new (locales?: string | string[], options?: unknown) => object;

/**
 * Replace one `Intl` constructor with a locale-injecting wrapper.
 *
 * `resolvedOptions()` needs no separate patch: the instance really was built with
 * the spoofed tag, so the native `resolvedOptions` already reports it — and every
 * value it derives from the locale is correspondingly correct. That is the payoff
 * of injecting rather than faking.
 */
function patchIntlConstructor(intl: typeof Intl, name: (typeof INTL_CONSTRUCTORS)[number]): void {
  const container = intl as unknown as Record<string, unknown>;
  const Native = container[name] as IntlCtor | undefined;
  if (typeof Native !== "function") return; // not implemented on this engine

  try {
    const Override = function (
      this: unknown,
      locales?: string | string[],
      options?: unknown
    ): object {
      // Honor new.target so `class X extends Intl.NumberFormat {}` and
      // Reflect.construct keep the subclass prototype. Called without `new`,
      // these constructors still return an instance, so fall back to Native.
      const newTarget = (new.target ?? Native) as unknown as new (...a: unknown[]) => object;
      try {
        return Reflect.construct(
          Native as never,
          [resolveEffectiveLocales(locales), options],
          newTarget
        );
      } catch (error) {
        // The spoofed tag should never break a construction the page would
        // otherwise have completed — the background already confirmed the engine
        // supports it. But if anything does go wrong, retry with the caller's
        // own arguments so the page behaves exactly as it would unspoofed.
        logger.error(`Error in Intl.${name} constructor override:`, error);
        try {
          return Reflect.construct(Native as never, [locales, options], newTarget);
        } catch (err) {
          // The caller's own arguments are invalid (e.g. a bad tag from the
          // page): the engine's genuine RangeError is correct to surface, but
          // its stack carries our injected frame. Scrub, then rethrow.
          stripExtensionFramesFromStack(err);
          throw err;
        }
      }
    } as unknown as IntlCtor;

    // Preserve the native statics and prototype identity so brand checks,
    // `instanceof`, and `supportedLocalesOf` all keep working.
    const nativeProto = (Native as unknown as { prototype: object }).prototype;
    installOverride(intl, name, Override as unknown as never, Native.length);
    Object.defineProperty(container[name] as object, "prototype", {
      value: nativeProto,
      writable: false,
      configurable: false,
    });
    const supportedLocalesOf = (Native as unknown as Record<string, unknown>).supportedLocalesOf;
    if (typeof supportedLocalesOf === "function") {
      (container[name] as Record<string, unknown>).supportedLocalesOf = supportedLocalesOf;
    }
  } catch (error) {
    logger.error(`Failed to override Intl.${name}:`, error);
  }
}

// ── navigator.language / navigator.languages ─────────────────────────────────

/**
 * Override the two `NavigatorLanguage` accessors on a realm's
 * `Navigator.prototype`.
 *
 * These are accessors, not methods, so they go through `installScrubbedAccessor`
 * — which wraps them in the same method-shorthand `stripConstruct` used for
 * methods, giving them no `prototype` and no `[[Construct]]` (matching a native
 * accessor) and scrubbing our frames off any error the native fallback throws.
 */
function patchNavigatorLanguage(win: Window & typeof globalThis): void {
  try {
    const NavigatorProto = (win as unknown as { Navigator?: { prototype: object } }).Navigator
      ?.prototype;
    if (!NavigatorProto) return;

    const languageDesc = Object.getOwnPropertyDescriptor(NavigatorProto, "language");
    const languagesDesc = Object.getOwnPropertyDescriptor(NavigatorProto, "languages");
    // Detached on purpose and always re-applied with an explicit receiver via
    // Reflect.apply below, so the native getter sees the real `this` the page
    // called with. Same pattern as the detached Date.prototype originals in
    // state.ts.
    /* eslint-disable @typescript-eslint/unbound-method */
    const nativeLanguageGet = languageDesc?.get;
    const nativeLanguagesGet = languagesDesc?.get;
    /* eslint-enable @typescript-eslint/unbound-method */

    if (typeof nativeLanguageGet === "function") {
      installScrubbedAccessor(NavigatorProto, "language", {
        get: function (this: unknown): string {
          try {
            const tag = activeTag();
            if (tag !== null) return tag;
          } catch (error) {
            logger.error("Error in navigator.language override:", error);
          }
          return Reflect.apply(nativeLanguageGet, this, []) as string;
        },
      });
    }

    if (typeof nativeLanguagesGet === "function") {
      installScrubbedAccessor(NavigatorProto, "languages", {
        get: function (this: unknown): readonly string[] {
          try {
            const languages = activeLanguages();
            if (languages) {
              // Fresh copy per read, frozen like the native value, so a page
              // mutating the result can't corrupt our state or observe that the
              // same array object is handed out twice.
              return Object.freeze([...languages]);
            }
          } catch (error) {
            logger.error("Error in navigator.languages override:", error);
          }
          return Reflect.apply(nativeLanguagesGet, this, []) as readonly string[];
        },
      });
    }
  } catch (error) {
    logger.error("Failed to override navigator language accessors:", error);
  }
}

// ── toLocale* / localeCompare on primitives ──────────────────────────────────

/**
 * Wrap one locale-sensitive prototype method so an omitted `locales` argument
 * defaults to the spoofed tag.
 *
 * Covers `Number`/`BigInt`/`Array.prototype.toLocaleString`,
 * `String.prototype.localeCompare`, and the locale-sensitive case mappings.
 * `toLocaleUpperCase`/`toLocaleLowerCase` matter more than they look: their
 * results genuinely differ by locale (Turkish dotless i is the classic case), so
 * leaving them on the real locale would contradict the reported tag.
 *
 * @param proto the prototype to patch, in the target realm
 * @param method the method name
 * @param localesArgIndex which argument position holds `locales`
 */
function patchLocaleMethod(proto: object, method: string, localesArgIndex: number): void {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(proto, method);
    const native = descriptor?.value as ((...args: unknown[]) => unknown) | undefined;
    if (typeof native !== "function") return; // not on this engine

    installOverride(
      proto,
      method,
      function (this: unknown, ...args: unknown[]): unknown {
        try {
          const tag = activeTag();
          if (tag !== null && args[localesArgIndex] === undefined) {
            // Pad so we can set the locales slot even when the caller passed
            // fewer arguments than its position.
            const patched = [...args];
            while (patched.length <= localesArgIndex) patched.push(undefined);
            patched[localesArgIndex] = tag;
            return Reflect.apply(native, this, patched);
          }
        } catch (error) {
          logger.error(`Error in ${method} override:`, error);
        }
        try {
          return Reflect.apply(native, this, args);
        } catch (err) {
          stripExtensionFramesFromStack(err);
          throw err;
        }
      },
      native.length
    );
  } catch (error) {
    logger.error(`Failed to override ${method}:`, error);
  }
}

// ── Install ──────────────────────────────────────────────────────────────────

/**
 * Install every locale override on a target realm.
 *
 * Realm-parameterized so the top-level realm and each same-origin iframe realm
 * run the same implementation against their own globals. Each section is
 * independently guarded: a failure in one cannot prevent the others installing,
 * matching how the Date/Intl installers behave.
 */
export function installLocaleOverridesOn(win: Window & typeof globalThis): void {
  patchNavigatorLanguage(win);

  const intl = (win as unknown as { Intl?: typeof Intl }).Intl;
  if (intl) {
    for (const name of INTL_CONSTRUCTORS) {
      patchIntlConstructor(intl, name);
    }
  }

  const w = win as unknown as Record<string, { prototype: object } | undefined>;

  // `locales` is argument 0 for toLocaleString and the case mappings, and
  // argument 1 for localeCompare (which takes the comparison string first).
  if (w.Number) patchLocaleMethod(w.Number.prototype, "toLocaleString", 0);
  if (w.BigInt) patchLocaleMethod(w.BigInt.prototype, "toLocaleString", 0);
  if (w.Array) patchLocaleMethod(w.Array.prototype, "toLocaleString", 0);
  if (w.String) {
    patchLocaleMethod(w.String.prototype, "localeCompare", 1);
    patchLocaleMethod(w.String.prototype, "toLocaleUpperCase", 0);
    patchLocaleMethod(w.String.prototype, "toLocaleLowerCase", 0);
  }
}

/** Install the locale overrides on the top-level realm. */
export function installLocaleOverrides(): void {
  installLocaleOverridesOn(globalThis as Window & typeof globalThis);
}
