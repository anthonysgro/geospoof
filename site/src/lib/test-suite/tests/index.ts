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
    { geolocationStealthTests },
    { timezoneStealthTests },
    { extensionPresenceTests },
  ] = await Promise.all([
    import("./geolocation"),
    import("./geolocation-stealth"),
    import("./timezone-stealth"),
    import("./extension-presence"),
  ])

  return [
    ...geolocationTests,
    ...geolocationStealthTests,
    ...timezoneStealthTests,
    ...extensionPresenceTests,
  ]
}
