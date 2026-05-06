/**
 * Detection batteries for timezone/date-related overrides.
 *
 * Applies the standard battery to every Date.prototype method,
 * Intl.DateTimeFormat accessor, Temporal.Now method, and
 * Function.prototype.toString — anywhere a user-facing API has been
 * modified and a fingerprinter might probe the shape of the replacement.
 */

import { buildStandardBattery } from "../helpers/standard-battery"
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

const dateProtoBatteries: Array<TestDefinition> = DATE_PROTOTYPE_METHODS.flatMap(
  ({ prop, length }) => [
    ...buildStandardBattery({
      idPrefix: `timezone-stealth.date-proto-${prop}`,
      group: "timezone-stealth",
      apiLabel: `Date.prototype.${prop}`,
      target: Date.prototype,
      propertyName: prop,
      expectedLength: length,
    }),
  ]
)

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
  }),
  ...buildStandardBattery({
    idPrefix: "timezone-stealth.intl-datetimeformat-resolvedoptions",
    group: "timezone-stealth",
    apiLabel: "Intl.DateTimeFormat.prototype.resolvedOptions",
    target: Intl.DateTimeFormat.prototype,
    propertyName: "resolvedOptions",
    expectedLength: 0,
  }),
]

/**
 * Temporal.Now methods — only included when the Temporal API is available.
 * Temporal is a stage-3 proposal at varying levels of support across engines.
 * Accessed via a dynamic lookup on globalThis so the TS lib doesn't need to
 * know about the global.
 */
const temporalBatteries: Array<TestDefinition> = (() => {
  const temporalNow = (globalThis as unknown as { Temporal?: { Now: object } }).Temporal?.Now
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
 * Function.prototype.toString itself is overridden. A fingerprinter will
 * apply Function.prototype.toString to Function.prototype.toString to see
 * whether the override masks itself.
 */
const functionToStringBattery: ReadonlyArray<TestDefinition> = buildStandardBattery({
  idPrefix: "timezone-stealth.function-prototype-tostring",
  group: "timezone-stealth",
  apiLabel: "Function.prototype.toString",
  target: Function.prototype,
  propertyName: "toString",
  expectedLength: 0,
})

export const timezoneStealthTests: ReadonlyArray<TestDefinition> = [
  ...dateProtoBatteries,
  ...dateStaticBatteries,
  ...intlBatteries,
  ...temporalBatteries,
  ...functionToStringBattery,
]
