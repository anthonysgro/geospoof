/**
 * Shared helper to import the background module fresh for each test.
 *
 * Calls `vi.resetModules()` before the dynamic import so every test
 * gets a clean module instance with fresh state.
 */
export async function importBackground() {
  vi.resetModules();
  return import("@/background");
}
