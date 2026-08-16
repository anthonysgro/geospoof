import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("BG");

/** ID used by the short-lived Safari 16.4–17 runtime-registration path. */
export const LEGACY_MAIN_WORLD_SCRIPT_ID = "gs-main-world";

interface RegisteredContentScript {
  id: string;
}

interface RegistrationCleanupApi {
  getRegisteredContentScripts(filter: { ids: string[] }): Promise<RegisteredContentScript[]>;
  unregisterContentScripts(filter: { ids: string[] }): Promise<void>;
}

function cleanupApi(): RegistrationCleanupApi | null {
  const scripting = browser.scripting as unknown as Partial<RegistrationCleanupApi> | undefined;
  if (
    typeof scripting?.getRegisteredContentScripts !== "function" ||
    typeof scripting.unregisterContentScripts !== "function"
  ) {
    return null;
  }
  return scripting as RegistrationCleanupApi;
}

/**
 * Remove the persisted registration created by older Safari builds.
 *
 * Current Safari injects solely through the manifest. This migration never
 * registers or executes a script; it only prevents an upgraded installation
 * from running the old persisted registration alongside the manifest entry.
 */
export async function removeLegacyMainWorldRegistration(): Promise<void> {
  const api = cleanupApi();
  if (!api) return;

  try {
    const registrations = await api.getRegisteredContentScripts({
      ids: [LEGACY_MAIN_WORLD_SCRIPT_ID],
    });
    if (!registrations.some(({ id }) => id === LEGACY_MAIN_WORLD_SCRIPT_ID)) return;

    await api.unregisterContentScripts({ ids: [LEGACY_MAIN_WORLD_SCRIPT_ID] });
    logger.info("[main-world] removed legacy runtime registration");
  } catch (error) {
    // The static manifest path remains authoritative even if Safari rejects a
    // migration read. Do not let cleanup prevent the background from starting.
    logger.warn("[main-world] could not remove legacy runtime registration:", error);
  }
}
