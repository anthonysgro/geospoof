/**
 * Detection helpers for profiling overridden APIs.
 *
 * These utilities collect the "fingerprintable attributes" of a function,
 * accessor, or property so tests can assert them individually. The helpers
 * never throw — they encode failures in the returned profile — so a single
 * call can power many pass/fail tests.
 */

/**
 * Profile of a function-valued property.
 */
export interface FunctionProfile {
  /** Did the property exist on the target at all? */
  exists: boolean
  /** The property descriptor's attribute flags, or null when unreadable. */
  descriptor: {
    configurable: boolean
    enumerable: boolean
    writable: boolean | null // null when value-less accessor descriptor
    hasValue: boolean
    hasGet: boolean
    hasSet: boolean
  } | null
  /** Output of Function.prototype.toString.call(fn). */
  toStringValue: string | null
  /** Whether toStringValue contains the [native code] marker. */
  looksNative: boolean
  /** fn.name */
  name: string | null
  /** fn.length */
  length: number | null
  /** Does fn have a prototype property? (Native methods typically don't.) */
  hasPrototype: boolean
  /** Does `new fn()` throw TypeError? (Native methods typically do.) */
  isNonConstructable: boolean
  /** In strict mode, fn.caller should throw TypeError. */
  callerThrowsInStrict: boolean
  /** In strict mode, fn.arguments should throw TypeError. */
  argumentsThrowsInStrict: boolean
  /** Any error encountered while profiling (one string per failed probe). */
  errors: ReadonlyArray<string>
}

/**
 * Profile of an accessor (getter/setter) property.
 */
export interface AccessorProfile {
  exists: boolean
  descriptor: {
    configurable: boolean
    enumerable: boolean
    hasGet: boolean
    hasSet: boolean
  } | null
  /** Profile of the getter function, if present. */
  getter: FunctionProfile | null
  /** Profile of the setter function, if present. */
  setter: FunctionProfile | null
  errors: ReadonlyArray<string>
}

/* ------------------------------------------------------------------ */
/* Utilities                                                          */
/* ------------------------------------------------------------------ */

function safe<T>(fn: () => T, errors: Array<string>, label: string): T | null {
  try {
    return fn()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errors.push(`${label}: ${msg}`)
    return null
  }
}

/**
 * Build a FunctionProfile from an existing function reference.
 * Separated so it can be reused for both own-property functions and
 * accessor getters/setters.
 */
function profileFunction(
  fn: unknown,
  descriptor: PropertyDescriptor | undefined
): FunctionProfile {
  const errors: Array<string> = []

  if (typeof fn !== "function") {
    return {
      exists: false,
      descriptor: null,
      toStringValue: null,
      looksNative: false,
      name: null,
      length: null,
      hasPrototype: false,
      isNonConstructable: false,
      callerThrowsInStrict: false,
      argumentsThrowsInStrict: false,
      errors: ["value is not a function"],
    }
  }

  const toStringValue = safe(
    () => Function.prototype.toString.call(fn),
    errors,
    "toString"
  )
  const looksNative = toStringValue
    ? /\[native code\]/.test(toStringValue)
    : false

  const name = safe<string>(
    () => (fn as { name?: unknown }).name as string,
    errors,
    "name"
  )
  const length = safe<number>(
    () => (fn as { length?: unknown }).length as number,
    errors,
    "length"
  )

  // `prototype` is an own data property on most user-defined functions and
  // absent on native methods, arrow functions, and method-shorthand
  // functions. We check for "own" specifically — inherited properties
  // don't count (they come from Function.prototype).
  const hasPrototype = Object.prototype.hasOwnProperty.call(fn, "prototype")

  // Non-constructable check: native methods and method-shorthand functions
  // throw TypeError when called with `new`. Regular function expressions do not.
  let isNonConstructable = false
  try {
    // Reflect.construct will always invoke [[Construct]] if it exists; if
    // it doesn't, Reflect.construct throws TypeError synchronously.
    // We use a sentinel Target to avoid affecting global state.
    Reflect.construct(fn as new (...args: Array<unknown>) => unknown, [])
    isNonConstructable = false
  } catch {
    isNonConstructable = true
  }

  // In strict mode, accessing `.caller` and `.arguments` on a strict
  // function throws TypeError. Accessing them on a non-strict function
  // returns null (or the caller/arguments). Native methods behave like
  // strict functions for these checks.
  const callerThrowsInStrict = (() => {
    try {
      void (fn as { caller?: unknown }).caller
      return false
    } catch {
      return true
    }
  })()
  const argumentsThrowsInStrict = (() => {
    try {
      void (fn as { arguments?: unknown }).arguments
      return false
    } catch {
      return true
    }
  })()

  // Descriptor may be undefined when this profile is built from a bare
  // function reference (e.g., an accessor's getter).
  const profiledDescriptor: FunctionProfile["descriptor"] = descriptor
    ? {
        configurable: descriptor.configurable ?? false,
        enumerable: descriptor.enumerable ?? false,
        writable:
          "writable" in descriptor ? (descriptor.writable ?? false) : null,
        hasValue: "value" in descriptor,
        hasGet: "get" in descriptor && typeof descriptor.get === "function",
        hasSet: "set" in descriptor && typeof descriptor.set === "function",
      }
    : null

  return {
    exists: true,
    descriptor: profiledDescriptor,
    toStringValue,
    looksNative,
    name,
    length,
    hasPrototype,
    isNonConstructable,
    callerThrowsInStrict,
    argumentsThrowsInStrict,
    errors,
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Profile a function-valued property on a target object.
 *
 * `propertyName` is looked up as an own property of `target`. For
 * prototype methods pass the prototype directly:
 *   describeProperty(Date.prototype, "getTimezoneOffset")
 */
export function describeProperty(
  target: object,
  propertyName: string
): FunctionProfile {
  const descriptor = Object.getOwnPropertyDescriptor(target, propertyName)

  if (!descriptor) {
    return {
      exists: false,
      descriptor: null,
      toStringValue: null,
      looksNative: false,
      name: null,
      length: null,
      hasPrototype: false,
      isNonConstructable: false,
      callerThrowsInStrict: false,
      argumentsThrowsInStrict: false,
      errors: [`no own property descriptor for "${propertyName}"`],
    }
  }

  // Data property — profile the value directly.
  if ("value" in descriptor) {
    return profileFunction(descriptor.value, descriptor)
  }

  // Accessor property — this helper wants the value-side profile, so
  // surface that mismatch in errors. Callers who want accessor details
  // should use describeAccessor.
  return {
    exists: true,
    descriptor: {
      configurable: descriptor.configurable ?? false,
      enumerable: descriptor.enumerable ?? false,
      writable: null,
      hasValue: false,
      hasGet: typeof descriptor.get === "function",
      hasSet: typeof descriptor.set === "function",
    },
    toStringValue: null,
    looksNative: false,
    name: null,
    length: null,
    hasPrototype: false,
    isNonConstructable: false,
    callerThrowsInStrict: false,
    argumentsThrowsInStrict: false,
    errors: ["property is an accessor; use describeAccessor instead"],
  }
}

/**
 * Profile an accessor (getter/setter) property on a target object.
 *
 * Useful for `HTMLIFrameElement.prototype.contentWindow`,
 * `HTMLIFrameElement.prototype.contentDocument`, and
 * `Element.prototype.innerHTML` (which is an accessor with a setter).
 */
export function describeAccessor(
  target: object,
  propertyName: string
): AccessorProfile {
  const descriptor = Object.getOwnPropertyDescriptor(target, propertyName)

  if (!descriptor) {
    return {
      exists: false,
      descriptor: null,
      getter: null,
      setter: null,
      errors: [`no own property descriptor for "${propertyName}"`],
    }
  }

  const hasGet = typeof descriptor.get === "function"
  const hasSet = typeof descriptor.set === "function"

  if (!hasGet && !hasSet) {
    return {
      exists: true,
      descriptor: {
        configurable: descriptor.configurable ?? false,
        enumerable: descriptor.enumerable ?? false,
        hasGet: false,
        hasSet: false,
      },
      getter: null,
      setter: null,
      errors: ["property is not an accessor; use describeProperty instead"],
    }
  }

  return {
    exists: true,
    descriptor: {
      configurable: descriptor.configurable ?? false,
      enumerable: descriptor.enumerable ?? false,
      hasGet,
      hasSet,
    },
    getter: hasGet ? profileFunction(descriptor.get, undefined) : null,
    setter: hasSet ? profileFunction(descriptor.set, undefined) : null,
    errors: [],
  }
}
