import type { TestDefinition } from "../types"

/**
 * Build the full test manifest.
 *
 * Many test definitions capture references to browser globals at
 * construction time (e.g. `HTMLIFrameElement.prototype`, `navigator.geolocation`,
 * `Intl.DateTimeFormat`). Those identifiers don't exist on the server, so
 * importing the test modules at module-load would crash SSR.
 *
 * We lazy-import the per-category test modules inside this function so
 * the browser-only code is only touched after hydration, when the
 * TestSuite component is mounted.
 */
export async function loadAllTests(): Promise<ReadonlyArray<TestDefinition>> {
  const [
    { geolocationTests },
    { valuesCorrectnessTests, geolocationStealthBehavioralTests },
    { internalConsistencyTests },
    { iframeBehavioralTests },
    { webbrowsertoolsTechniquesTests },
    { geolocationAdvancedTests },
    { geolocationStealthTests },
    { timezoneStealthTests },
    { extensionPresenceTests },
    { iframeRealmTests },
    { workerLeakTests },
    { lastModifiedTests },
    { crossMethodOffsetTests },
    { raceConditionTests },
  ] = await Promise.all([
    import("./geolocation"),
    import("./values-correctness"),
    import("./internal-consistency"),
    import("./iframe-behavioral"),
    import("./webbrowsertools-techniques"),
    import("./geolocation-advanced"),
    import("./geolocation-stealth"),
    import("./timezone-stealth"),
    import("./extension-presence"),
    import("./iframe-realm"),
    import("./worker-leaks"),
    import("./last-modified"),
    import("./cross-method-offsets"),
    import("./race-condition"),
  ])

  return [
    ...geolocationTests,
    ...valuesCorrectnessTests,
    ...internalConsistencyTests,
    ...iframeBehavioralTests,
    ...geolocationStealthTests,
    ...geolocationStealthBehavioralTests,
    ...webbrowsertoolsTechniquesTests,
    ...geolocationAdvancedTests,
    ...timezoneStealthTests,
    ...extensionPresenceTests,
    ...iframeRealmTests,
    ...workerLeakTests,
    ...lastModifiedTests,
    ...crossMethodOffsetTests,
    ...raceConditionTests,
  ]
}
