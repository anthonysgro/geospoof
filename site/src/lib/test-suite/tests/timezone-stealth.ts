/**
 * Detection batteries for timezone/date-related overrides.
 *
 * Applies the standard battery to every Date.prototype method,
 * Intl.DateTimeFormat accessor, Temporal.Now method, and
 * Function.prototype.toString — anywhere a user-facing API has been
 * modified and a fingerprinter might probe the shape of the replacement.
 */

import { buildStandardBattery } from "../helpers/standard-battery"
import { SkipTestError, buildBehavioralTest } from "../helpers/behavioral"
import type { TestDefinition } from "../types"

/**
 * Native arity for each Date.prototype method being overridden.
 * Values come from the ECMAScript specification and are stable across
 * Firefox, Chromium, and WebKit.
 */
const DATE_PROTOTYPE_METHODS: ReadonlyArray<{
  prop: string
  length: number
}> = [
  { prop: "getTimezoneOffset", length: 0 },
  { prop: "toString", length: 0 },
  { prop: "toDateString", length: 0 },
  { prop: "toTimeString", length: 0 },
  { prop: "toLocaleString", length: 0 },
  { prop: "toLocaleDateString", length: 0 },
  { prop: "toLocaleTimeString", length: 0 },
  { prop: "getHours", length: 0 },
  { prop: "getMinutes", length: 0 },
  { prop: "getSeconds", length: 0 },
  { prop: "getMilliseconds", length: 0 },
  { prop: "getDate", length: 0 },
  { prop: "getDay", length: 0 },
  { prop: "getMonth", length: 0 },
  { prop: "getFullYear", length: 0 },
]

const dateProtoBatteries: Array<TestDefinition> =
  DATE_PROTOTYPE_METHODS.flatMap(({ prop, length }) => [
    ...buildStandardBattery({
      idPrefix: `timezone-stealth.date-proto-${prop}`,
      group: "timezone-stealth",
      apiLabel: `Date.prototype.${prop}`,
      target: Date.prototype,
      propertyName: prop,
      expectedLength: length,
    }),
  ])

/**
 * Date constructor statics that are installed (or re-registered for
 * toString masking) by the extension.
 */
const dateStaticBatteries: Array<TestDefinition> = [
  ...buildStandardBattery({
    idPrefix: "timezone-stealth.date-parse",
    group: "timezone-stealth",
    apiLabel: "Date.parse",
    target: Date,
    propertyName: "parse",
    expectedLength: 1,
  }),
  ...buildStandardBattery({
    idPrefix: "timezone-stealth.date-now",
    group: "timezone-stealth",
    apiLabel: "Date.now",
    target: Date,
    propertyName: "now",
    expectedLength: 0,
  }),
  ...buildStandardBattery({
    idPrefix: "timezone-stealth.date-utc",
    group: "timezone-stealth",
    apiLabel: "Date.UTC",
    target: Date,
    propertyName: "UTC",
    expectedLength: 7,
  }),
]

/**
 * Intl.DateTimeFormat constructor and resolvedOptions.
 *
 * Intl.DateTimeFormat is itself a function (the constructor), so we
 * probe it the same way — but its descriptor on `Intl` is writable,
 * configurable, enumerable: false (matches spec defaults for namespace
 * members). resolvedOptions is a regular prototype method.
 */
const intlBatteries: Array<TestDefinition> = [
  ...buildStandardBattery({
    idPrefix: "timezone-stealth.intl-datetimeformat",
    group: "timezone-stealth",
    apiLabel: "Intl.DateTimeFormat",
    target: Intl,
    propertyName: "DateTimeFormat",
    // The DateTimeFormat constructor's length is 0 per the spec.
    expectedLength: 0,
    isConstructor: true,
  }),
  ...buildStandardBattery({
    idPrefix: "timezone-stealth.intl-datetimeformat-resolvedoptions",
    group: "timezone-stealth",
    apiLabel: "Intl.DateTimeFormat.prototype.resolvedOptions",
    target: Intl.DateTimeFormat.prototype,
    propertyName: "resolvedOptions",
    expectedLength: 0,
  }),
  // Additional prototype methods. `formatToParts` is widely supported
  // and is the primary structured-output surface pages use to read
  // timezone info. `formatRange` / `formatRangeToParts` are feature-
  // gated — they landed in Chrome 76 / Firefox 91 but may still be
  // absent in some runtimes — so we only register the battery when
  // the method exists on the prototype.
  ...buildStandardBattery({
    idPrefix: "timezone-stealth.intl-datetimeformat-formattoparts",
    group: "timezone-stealth",
    apiLabel: "Intl.DateTimeFormat.prototype.formatToParts",
    target: Intl.DateTimeFormat.prototype,
    propertyName: "formatToParts",
    expectedLength: 1,
  }),
  ...(typeof (
    Intl.DateTimeFormat.prototype as unknown as {
      formatRange?: unknown
    }
  ).formatRange === "function"
    ? buildStandardBattery({
        idPrefix: "timezone-stealth.intl-datetimeformat-formatrange",
        group: "timezone-stealth",
        apiLabel: "Intl.DateTimeFormat.prototype.formatRange",
        target: Intl.DateTimeFormat.prototype,
        propertyName: "formatRange",
        expectedLength: 2,
      })
    : []),
  ...(typeof (
    Intl.DateTimeFormat.prototype as unknown as {
      formatRangeToParts?: unknown
    }
  ).formatRangeToParts === "function"
    ? buildStandardBattery({
        idPrefix: "timezone-stealth.intl-datetimeformat-formatrangetoparts",
        group: "timezone-stealth",
        apiLabel: "Intl.DateTimeFormat.prototype.formatRangeToParts",
        target: Intl.DateTimeFormat.prototype,
        propertyName: "formatRangeToParts",
        expectedLength: 2,
      })
    : []),
]

/**
 * Temporal.Now methods — only included when the Temporal API is available.
 * Temporal is a stage-3 proposal at varying levels of support across engines.
 * Accessed via a dynamic lookup on globalThis so the TS lib doesn't need to
 * know about the global.
 */
const temporalBatteries: Array<TestDefinition> = (() => {
  const temporalNow = (globalThis as unknown as { Temporal?: { Now: object } })
    .Temporal?.Now
  if (!temporalNow) return []
  const methods: Array<{ prop: string; length: number }> = [
    { prop: "timeZoneId", length: 0 },
    { prop: "plainDateTimeISO", length: 0 },
    { prop: "plainDateISO", length: 0 },
    { prop: "plainTimeISO", length: 0 },
    { prop: "zonedDateTimeISO", length: 0 },
  ]
  return methods.flatMap(({ prop, length }) =>
    buildStandardBattery({
      idPrefix: `timezone-stealth.temporal-now-${prop.toLowerCase()}`,
      group: "timezone-stealth",
      apiLabel: `Temporal.Now.${prop}`,
      target: temporalNow,
      propertyName: prop,
      expectedLength: length,
    })
  )
})()

/**
 * The global `Date` constructor, replaced wholesale by the extension.
 * It must retain constructor semantics — own prototype, constructable,
 * standard descriptor shape — to stay indistinguishable.
 */
const dateGlobalBattery: ReadonlyArray<TestDefinition> = buildStandardBattery({
  idPrefix: "timezone-stealth.date-global",
  group: "timezone-stealth",
  apiLabel: "Date",
  target: globalThis,
  propertyName: "Date",
  // Native Date constructor arity is 7 per ECMA-262 §21.4.2.
  expectedLength: 7,
  isConstructor: true,
})

/**
 * Function.prototype.toString itself is overridden. A fingerprinter will
 * apply Function.prototype.toString to Function.prototype.toString to see
 * whether the override masks itself.
 */
const functionToStringBattery: ReadonlyArray<TestDefinition> =
  buildStandardBattery({
    idPrefix: "timezone-stealth.function-prototype-tostring",
    group: "timezone-stealth",
    apiLabel: "Function.prototype.toString",
    target: Function.prototype,
    propertyName: "toString",
    expectedLength: 0,
  })

// ---------------------------------------------------------------------------
// new.target / subclassing fidelity
//
// Native Date and Intl.DateTimeFormat are real constructors: subclassing and
// Reflect.construct preserve the caller's prototype. A plain-function override
// that `return`s a fresh instance discards `new.target`, so `new X() instanceof
// X` becomes false — a deterministic tell that the constructor was replaced,
// and it breaks legitimate `class X extends Date {}` code. These assert the
// overrides honor new.target. Self-verifying: on a clean browser the natives
// already pass; only a naive override fails.
// ---------------------------------------------------------------------------

/**
 * True when subclassing `ctor` and `Reflect.construct(ctor, [], Fake)` both
 * preserve the intended prototype (native constructor semantics).
 */
function subclassPreservesPrototype(ctor: unknown): boolean {
  const Ctor = ctor as new (...a: Array<unknown>) => object
  class Sub extends Ctor {}
  const inst = new Sub()
  const Fake = function FakeCtor() {} as unknown as new (
    ...a: Array<unknown>
  ) => object
  const reflected = Reflect.construct(Ctor, [], Fake) as object
  return (
    inst instanceof Sub &&
    Object.getPrototypeOf(inst) ===
      (Sub as unknown as { prototype: object }).prototype &&
    Object.getPrototypeOf(reflected) ===
      (Fake as unknown as { prototype: object }).prototype
  )
}

const SUBCLASS_SNIPPET = `class X extends Date {}
new X() instanceof X                                   // must be true
Object.getPrototypeOf(Reflect.construct(Date, [], function F(){})) === F.prototype`

const dateSubclassFidelityTest = buildBehavioralTest<boolean>({
  id: "timezone-stealth.date-subclass-fidelity",
  group: "timezone-stealth",
  name: "Date subclassing / Reflect.construct preserve the subclass prototype",
  description:
    "Native Date is a real constructor: `class X extends Date {}` yields instances whose prototype is X.prototype, and `Reflect.construct(Date, [], F)` yields F.prototype. An override that returns a fresh Date discards new.target, so `new X() instanceof X` becomes false — a deterministic tell that Date was replaced (and it breaks legitimate subclassing). The override now constructs via Reflect.construct(OriginalDate, args, new.target).",
  technique:
    "class X extends Date {} → assert new X() instanceof X and prototype === X.prototype; Reflect.construct(Date, [], F) → assert prototype === F.prototype.",
  codeSnippet: SUBCLASS_SNIPPET,
  expected: async () => ({ value: true, describe: "prototype preserved" }),
  observe: async () => {
    const pass = subclassPreservesPrototype(Date)
    return {
      value: pass,
      describe: pass
        ? "subclass + Reflect.construct preserve prototype"
        : "prototype not preserved",
    }
  },
})

const dtfSubclassFidelityTest = buildBehavioralTest<boolean>({
  id: "timezone-stealth.datetimeformat-subclass-fidelity",
  group: "timezone-stealth",
  name: "Intl.DateTimeFormat subclassing / Reflect.construct preserve the subclass prototype",
  description:
    "Same new.target fidelity for Intl.DateTimeFormat: `class X extends Intl.DateTimeFormat {}` must yield X.prototype instances. The override now constructs via Reflect.construct(NativeDateTimeFormat, args, new.target) so subclassing works and the spoofed timezone injection is preserved.",
  technique:
    "class X extends Intl.DateTimeFormat {} → assert new X() instanceof X and prototype === X.prototype; Reflect.construct(Intl.DateTimeFormat, [], F) → assert prototype === F.prototype.",
  codeSnippet: `class X extends Intl.DateTimeFormat {}\nnew X() instanceof X // must be true`,
  expected: async () => ({ value: true, describe: "prototype preserved" }),
  observe: async () => {
    const pass = subclassPreservesPrototype(Intl.DateTimeFormat)
    return {
      value: pass,
      describe: pass
        ? "subclass + Reflect.construct preserve prototype"
        : "prototype not preserved",
    }
  },
})

const iframeDateSubclassFidelityTest = buildBehavioralTest<boolean>({
  id: "tampering.iframe-realm.date-subclass-fidelity",
  group: "timezone-stealth",
  name: "Iframe-realm Date subclassing preserves the subclass prototype",
  description:
    "The cross-realm counterpart: the extension patches same-origin iframe realms, so the iframe's Date override must also honor new.target. Creates a same-origin iframe and asserts `class X extends iframe.Date {}` and `Reflect.construct(iframe.Date, [], F)` preserve the intended prototype.",
  technique:
    "Create a same-origin iframe, then subclass its Date and Reflect.construct against it; assert prototypes are preserved.",
  codeSnippet: `const w = iframe.contentWindow\nclass X extends w.Date {}\nnew X() instanceof X // must be true`,
  expected: async () => ({
    value: true,
    describe: "iframe-realm prototype preserved",
  }),
  observe: async () => {
    if (typeof document === "undefined" || !document.body) {
      throw new SkipTestError("no document.body to attach an iframe to")
    }
    const frame = document.createElement("iframe")
    frame.style.display = "none"
    document.body.appendChild(frame)
    try {
      const win = frame.contentWindow as (Window & typeof globalThis) | null
      if (!win)
        return { value: false, describe: "iframe exposed no contentWindow" }
      const pass = subclassPreservesPrototype(win.Date)
      return {
        value: pass,
        describe: pass
          ? "iframe Date subclass preserves prototype"
          : "iframe Date prototype not preserved",
      }
    } finally {
      frame.remove()
    }
  },
})

const iframeDtfSubclassFidelityTest = buildBehavioralTest<boolean>({
  id: "tampering.iframe-realm.datetimeformat-subclass-fidelity",
  group: "timezone-stealth",
  name: "Iframe-realm Intl.DateTimeFormat subclassing preserves the subclass prototype",
  description:
    "Cross-realm new.target fidelity for the iframe's Intl.DateTimeFormat override. Creates a same-origin iframe and asserts subclassing / Reflect.construct against its Intl.DateTimeFormat preserve the intended prototype.",
  technique:
    "Create a same-origin iframe, subclass its Intl.DateTimeFormat and Reflect.construct against it; assert prototypes are preserved.",
  codeSnippet: `const w = iframe.contentWindow\nclass X extends w.Intl.DateTimeFormat {}\nnew X() instanceof X // must be true`,
  expected: async () => ({
    value: true,
    describe: "iframe-realm prototype preserved",
  }),
  observe: async () => {
    if (typeof document === "undefined" || !document.body) {
      throw new SkipTestError("no document.body to attach an iframe to")
    }
    const frame = document.createElement("iframe")
    frame.style.display = "none"
    document.body.appendChild(frame)
    try {
      const win = frame.contentWindow as (Window & typeof globalThis) | null
      if (!win)
        return { value: false, describe: "iframe exposed no contentWindow" }
      const pass = subclassPreservesPrototype(win.Intl.DateTimeFormat)
      return {
        value: pass,
        describe: pass
          ? "iframe Intl.DateTimeFormat subclass preserves prototype"
          : "iframe Intl.DateTimeFormat prototype not preserved",
      }
    } finally {
      frame.remove()
    }
  },
})

export const timezoneStealthTests: ReadonlyArray<TestDefinition> = [
  ...dateProtoBatteries,
  ...dateStaticBatteries,
  ...dateGlobalBattery,
  ...intlBatteries,
  ...temporalBatteries,
  ...functionToStringBattery,
  dateSubclassFidelityTest,
  dtfSubclassFidelityTest,
  iframeDateSubclassFidelityTest,
  iframeDtfSubclassFidelityTest,
]
