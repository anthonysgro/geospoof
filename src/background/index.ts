/**
 * Background Script — Entry Point
 * Wires up initialization, event listeners, and re-exports all modules.
 *
 * MV3 event-page lifecycle: all listeners registered synchronously at the
 * top level; initialization runs inside onInstalled / onStartup callbacks.
 * Timer-based retry logic uses browser.alarms instead of setTimeout.
 */

import type { Runtime, Tabs, Alarms } from "webextension-polyfill";
import type { Message, UpdateSettingsPayload } from "@/shared/types/messages";
import { loadSettings, saveSettings } from "./settings";
import { setDebugEnabled, setVerbosityLevel, createLogger } from "@/shared/utils/debug-logger";
import { setWebRTCProtection } from "./webrtc";
import { updateBadge } from "./badge";
import { broadcastSettingsToTabs, isRestrictedUrl, checkTabInjection } from "./tabs";
import { computeEffectiveEnabled } from "@/shared/utils/scope";
import { handleMessage, handleSetLocation } from "./messages";
import { syncVpnLocation } from "./vpn-sync";
import { installProxyWatcher } from "./proxy-watcher";
import { installActivityWatcher } from "./activity-watcher";
import { adoptPendingSettingsFromApp } from "./app-bridge";
import {
  installWorkerRequestFilter,
  updateWorkerFilterSettings,
  isWorkerFilterSupported,
} from "./worker-request-filter";

const logger = createLogger("BG");

// Record the moment the background script first evaluates. Used to
// correlate content-script request timestamps with background-worker
// boot timestamps during cold-start diagnostics — when the worker was
// asleep, this log line appears just before `onMessage` fires for the
// first time; when the worker was warm, the log is absent from the
// run entirely. Routed through the logger so it's only visible when
// debug logging is enabled.
const BG_BOOT_AT = performance.now();
logger.debug(`Background script loading (t=${BG_BOOT_AT.toFixed(1)}ms since worker start)`);

// Re-export everything so `import("@/background")` keeps working for tests
export { DEFAULT_SETTINGS } from "@/shared/types/settings";
export { isValidIANATimezone } from "@/shared/utils/type-guards";
export {
  loadSettings,
  saveSettings,
  getSettings,
  updateSettings,
  validateSettings,
} from "./settings";
export {
  geocodeQuery,
  reverseGeocode,
  fetchWithRetry,
  getCacheKey,
  GEOCODING_TIMEOUT,
  MAX_RETRIES,
} from "./geocoding";
export { getTimezoneForCoordinates, clearTimezoneCache, computeOffsets } from "./timezone";
export { setWebRTCProtection } from "./webrtc";
export { updateBadge } from "./badge";
export { broadcastSettingsToTabs, isRestrictedUrl, checkTabInjection } from "./tabs";
export {
  handleMessage,
  handleSetLocation,
  handleSetProtectionStatus,
  handleSetWebRTCProtection,
  handleCompleteOnboarding,
  handleSetScopeMode,
  handleAddScopeSite,
  handleRemoveScopeSite,
} from "./messages";
export {
  isValidIpAddress,
  detectPublicIp,
  syncVpnLocation,
  clearIpGeoCache,
  clearEndpointCooldowns,
  resetRateLimiter,
  getLastSyncedIp,
  setLastSyncedIp,
  MIN_REQUEST_INTERVAL,
  REQUEST_TIMEOUT,
  GEO_TIMEOUT,
} from "./vpn-sync";
export type { IpGeolocationResult, VpnSyncError, VpnSyncResponse } from "./vpn-sync";
export {
  installProxyWatcher,
  isProxyWatcherSupported,
  PROXY_CHANGE_DEBOUNCE_MS,
  MIN_CHECK_INTERVAL_MS,
  _resetProxyWatcherState,
} from "./proxy-watcher";
export {
  installActivityWatcher,
  isActivityWatcherSupported,
  _resetActivityWatcherState,
} from "./activity-watcher";
export {
  triggerResyncCheck,
  RESYNC_DEBOUNCE_MS,
  SWITCH_SETTLE_MS,
  _resetResyncCoreState,
} from "./resync-core";

// --- Alarm constants ---

/** Prefix for injection-check alarm names */
const ALARM_PREFIX = "injection-check:";

/** Cumulative delays (ms) for injection check retries */
const ALARM_DELAYS = [500, 1500, 3500];

/** Maximum attempt index (0-based) */
const MAX_ATTEMPT = ALARM_DELAYS.length - 1;

export { ALARM_PREFIX, ALARM_DELAYS, MAX_ATTEMPT };

// --- Alarm helpers ---

/**
 * Build an alarm name encoding tab ID and attempt number.
 */
export function buildAlarmName(tabId: number, attempt: number): string {
  return `${ALARM_PREFIX}${tabId}:${attempt}`;
}

/**
 * Parse an injection-check alarm name. Returns null if the name doesn't match.
 */
export function parseAlarmName(name: string): { tabId: number; attempt: number } | null {
  if (!name.startsWith(ALARM_PREFIX)) return null;
  const rest = name.slice(ALARM_PREFIX.length);
  const parts = rest.split(":");
  if (parts.length !== 2) return null;
  const tabId = parseInt(parts[0], 10);
  const attempt = parseInt(parts[1], 10);
  if (isNaN(tabId) || isNaN(attempt)) return null;
  return { tabId, attempt };
}

/**
 * Clear all pending injection-check alarms for a given tab.
 */
async function clearAlarmsForTab(tabId: number): Promise<void> {
  for (let i = 0; i <= MAX_ATTEMPT; i++) {
    try {
      await browser.alarms.clear(buildAlarmName(tabId, i));
    } catch {
      // Alarm may not exist; ignore
    }
  }
}

export { clearAlarmsForTab };

// --- Initialization ---

async function initialize(): Promise<void> {
  // Safari only: adopt any location the containing app queued in the shared
  // App Group first, so a location set in the app takes effect as soon as
  // Safari launches — no popup interaction needed. Done before loadSettings so
  // the rest of init broadcasts the adopted state.
  await adoptPendingSettingsFromApp();

  const settings = await loadSettings();

  // One-time migration persistence (Req 3.6, 3.9). loadSettings() returns the
  // validated/upgraded in-memory Settings but does not itself write. To satisfy
  // Req 3.6 we detect whether the stored object was on an older/absent schema
  // by reading the raw stored `version` (the value before validation): a
  // present settings object whose version is not "1.1" was migrated to "1.1"
  // by validateSettings(). When that is the case we persist the upgraded object
  // exactly once. A fresh install with no stored settings object is skipped, so
  // we never needlessly write on first run. If persistence fails we keep the
  // in-memory upgraded Settings for the session and surface the error rather
  // than crashing init (Req 3.9); the next successful save persists the
  // migration.
  try {
    const stored = await browser.storage.local.get("settings");
    const rawSettings: unknown = stored.settings;
    const migrationOccurred =
      rawSettings != null &&
      typeof rawSettings === "object" &&
      (rawSettings as { version?: unknown }).version !== "1.1";
    if (migrationOccurred) {
      try {
        await saveSettings(settings);
      } catch (error) {
        logger.error("Failed to persist migrated settings on startup:", error);
      }
    }
  } catch (error) {
    logger.error("Failed to check stored settings for migration persistence:", error);
  }

  // Restore logger state from persisted settings
  setDebugEnabled(settings.debugLogging);
  setVerbosityLevel(settings.verbosityLevel);

  // Prime the worker-request-filter cache and install the listener
  // on engines that support webRequest.filterResponseData (Firefox
  // only). The listener itself short-circuits based on whether
  // spoofing is enabled and a timezone is configured, so the install
  // itself is unconditional on Firefox.
  updateWorkerFilterSettings(settings);
  await installWorkerRequestFilter();
  logger.debug(`[init] worker-request-filter support: ${isWorkerFilterSupported() ? "yes" : "no"}`);

  if (settings.webrtcProtection) {
    try {
      await setWebRTCProtection(true);
    } catch (error) {
      logger.error("Failed to apply WebRTC protection on startup:", error);
    }
  }

  if (settings.enabled && settings.location) {
    await broadcastSettingsToTabs(settings);
  }

  await updateBadge(settings.enabled);

  // Auto-sync VPN location on startup if enabled
  if (settings.vpnSyncEnabled) {
    try {
      const result = await syncVpnLocation(false);
      if (!("error" in result)) {
        await handleSetLocation(
          { latitude: result.latitude, longitude: result.longitude },
          { fromVpnSync: true, timezoneHint: result.timezone }
        );
      }
    } catch (error) {
      logger.warn("VPN auto-sync on startup failed:", error);
    }
  }

  // NOTE: the proxy-change and activity-driven resync watchers are installed
  // at the TOP LEVEL of this module (see installResyncWatchers() below), NOT
  // here. initialize() only runs from onInstalled/onStartup, but on a
  // non-persistent MV3 background (Firefox event page, Chromium service worker)
  // the background is torn down when idle and respawned by ordinary events
  // (e.g. an incoming message) without firing onStartup — so anything wired up
  // only inside initialize() is lost on the first respawn. Persistent wake
  // listeners must also be registered synchronously during the top-level run.
  // Installing the watchers at top level satisfies both. The install functions
  // are idempotent, so there's no harm if initialize() runs afterward.
}

/**
 * Install the VPN-resync watchers. Called synchronously at the top level (not
 * from initialize()) so the listeners survive MV3 background respawns and are
 * registered as persistent wake listeners on every engine.
 *
 * - proxy-change watcher: a browser-based VPN (e.g. the Proton VPN extension)
 *   switching exit nodes mutates `proxy.settings`, firing an event-driven
 *   re-sync. Feature-detects the proxy API and no-ops where unavailable
 *   (Safari, Firefox Android).
 * - activity-driven watcher (tab navigation + idle→active): covers the VPN
 *   classes the proxy watcher can't see — Firefox onRequest VPNs and OS/desktop
 *   VPNs — by re-checking the exit IP on real browser activity.
 *
 * Both watchers feed the same debounced, rate-limited, IP-diff gate, so they
 * coalesce rather than double up, and both self-gate on `vpnSyncEnabled` at
 * fire time. Both install functions are idempotent.
 */
function installResyncWatchers(): void {
  installProxyWatcher();
  installActivityWatcher();
}

export { installResyncWatchers };

// Register the resync watchers synchronously at module load. This top-level
// call runs on every background (re)spawn — including the message-driven
// respawns where onStartup/onInstalled (and therefore initialize()) never
// fire — which is what keeps the VPN auto-resync alive across the event-page /
// service-worker lifecycle.
installResyncWatchers();

export { initialize };

// --- Alarm handler ---

async function onAlarm(alarm: Alarms.Alarm): Promise<void> {
  const parsed = parseAlarmName(alarm.name);
  if (!parsed) return;

  const { tabId, attempt } = parsed;

  const settings = await loadSettings();
  const { location, timezone, debugLogging, verbosityLevel, webrtcProtection } = settings;

  try {
    const result = await checkTabInjection(tabId);
    if (result.injected) {
      // Clear remaining alarms for this tab
      await clearAlarmsForTab(tabId);

      // Resolve the per-tab Effective_Enabled for this late-injected tab from
      // its top-level URL via the shared source of truth (Req 7.5, 8.4, 9.3),
      // instead of delivering the global `enabled`. The alarm carries only the
      // tab id, so look up the tab's current URL; if the tab can't be resolved
      // the URL is undefined and computeEffectiveEnabled returns false.
      let tabUrl: string | undefined;
      try {
        const tab = await browser.tabs.get(tabId);
        tabUrl = tab.url;
      } catch {
        tabUrl = undefined;
      }
      const enabled = computeEffectiveEnabled({
        masterEnabled: settings.enabled,
        scopeMode: settings.scopeMode,
        allowlist: settings.allowlist,
        denylist: settings.denylist,
        topLevelUrl: tabUrl,
        isRestricted: isRestrictedUrl,
      });
      const scopedPayload: UpdateSettingsPayload = {
        enabled,
        location,
        timezone,
        debugLogging,
        verbosityLevel,
        webrtcProtection,
      };

      try {
        await browser.tabs.sendMessage(tabId, {
          type: "UPDATE_SETTINGS",
          payload: scopedPayload,
        });
      } catch {
        // Tab may have closed; ignore
      }

      void browser.action.setBadgeBackgroundColor({ color: "green", tabId });
      void browser.action.setBadgeText({ text: "✓", tabId });
    } else if (attempt >= MAX_ATTEMPT) {
      // Final attempt failed
      void browser.action.setBadgeBackgroundColor({ color: "orange", tabId });
      void browser.action.setBadgeText({ text: "!", tabId });
    }
  } catch {
    // Tab closed during check
    if (attempt >= MAX_ATTEMPT) {
      void browser.action.setBadgeBackgroundColor({ color: "orange", tabId });
      void browser.action.setBadgeText({ text: "!", tabId });
    }
  }
}

export { onAlarm };

// --- Event Listeners (registered synchronously at top level) ---

browser.runtime.onMessage.addListener((message: Message, sender: Runtime.MessageSender) => {
  // Timing probe to diagnose cold-start latency. Logs the gap between
  // worker boot and message arrival so we can tell if the delay users
  // see on "Settings not received in time" is the worker waking up,
  // the handler running, or the round-trip reply.
  const t0 = performance.now();
  logger.debug(
    `onMessage fired (type=${message.type}, since-boot=${(t0 - BG_BOOT_AT).toFixed(1)}ms)`
  );
  const result = handleMessage(message, sender);
  // `handleMessage` always returns a Promise (it's an async function).
  // Attach a passive probe to log when the handler actually settles
  // so we can correlate handler-time with round-trip time.
  void result.then(
    () => {
      logger.debug(
        `onMessage handler resolved (type=${message.type}, handler-time=${(performance.now() - t0).toFixed(1)}ms)`
      );
    },
    (err: unknown) => {
      logger.debug(
        `onMessage handler rejected (type=${message.type}, handler-time=${(performance.now() - t0).toFixed(1)}ms): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  );
  return result;
});

browser.runtime.onInstalled.addListener((details: Runtime.OnInstalledDetailsType) => {
  if (details.reason === "install") {
    console.log("Extension installed - onboarding will be displayed");
  }
  void initialize();
});

browser.runtime.onStartup.addListener(() => {
  void initialize();
});

// Safari only: app → extension pending-location bridge.
// onStartup is unreliable on iOS Safari, so adopt on background boot AND on
// tab activation/navigation — i.e. whenever the user is actually browsing.
// adoptPendingSettingsFromApp() dedups by timestamp, so repeated calls no-op
// once a change has been applied.
if (__SAFARI__) {
  void adoptPendingSettingsFromApp();

  // NOTE: the VPN resync watchers are armed unconditionally at the top level
  // via installResyncWatchers() above, so they're alive on Safari too (where
  // onStartup is unreliable). No Safari-specific install is needed here.

  if (browser.tabs?.onActivated) {
    browser.tabs.onActivated.addListener(() => {
      void adoptPendingSettingsFromApp();
    });
  }

  if (browser.tabs?.onUpdated) {
    browser.tabs.onUpdated.addListener(
      (_tabId: number, changeInfo: Tabs.OnUpdatedChangeInfoType) => {
        if (changeInfo.status === "loading") {
          void adoptPendingSettingsFromApp();
        }
      }
    );
  }
}

browser.alarms.onAlarm.addListener((alarm: Alarms.Alarm) => {
  void onAlarm(alarm);
});

if (browser.tabs && browser.tabs.onCreated) {
  browser.tabs.onCreated.addListener((tab: Tabs.Tab) => {
    void (async () => {
      const settings = await loadSettings();
      const { location, timezone, debugLogging, verbosityLevel, webrtcProtection } = settings;

      // Resolve Effective_Enabled for the newly created tab from its top-level
      // URL via the shared source of truth (Req 8.4, 9.3) rather than sending
      // the global `enabled`. A missing/undeterminable URL resolves to false.
      const enabled = computeEffectiveEnabled({
        masterEnabled: settings.enabled,
        scopeMode: settings.scopeMode,
        allowlist: settings.allowlist,
        denylist: settings.denylist,
        topLevelUrl: tab.url,
        isRestricted: isRestrictedUrl,
      });
      const scopedPayload: UpdateSettingsPayload = {
        enabled,
        location,
        timezone,
        debugLogging,
        verbosityLevel,
        webrtcProtection,
      };

      setTimeout(() => {
        void (async () => {
          try {
            await browser.tabs.sendMessage(tab.id!, {
              type: "UPDATE_SETTINGS",
              payload: scopedPayload,
            });
          } catch (error) {
            console.debug(`Could not send settings to new tab ${tab.id}:`, error);
          }
        })();
      }, 100);
    })();
  });
}

if (browser.tabs && browser.tabs.onUpdated) {
  browser.tabs.onUpdated.addListener(
    (tabId: number, changeInfo: Tabs.OnUpdatedChangeInfoType, tab: Tabs.Tab) => {
      if (changeInfo.status === "loading") {
        void (async () => {
          const settings = await loadSettings();

          if (!settings.enabled) {
            void browser.action.setBadgeBackgroundColor({ color: "gray", tabId });
            void browser.action.setBadgeText({ text: "", tabId });
            return;
          }

          const isRestricted = isRestrictedUrl(tab.url!);
          if (isRestricted) {
            void browser.action.setBadgeBackgroundColor({ color: "gray", tabId });
            void browser.action.setBadgeText({ text: "", tabId });
            return;
          }

          // Clear existing alarms for this tab (re-navigation cleanup)
          await clearAlarmsForTab(tabId);

          // Schedule injection checks via browser.alarms
          for (let i = 0; i < ALARM_DELAYS.length; i++) {
            try {
              void browser.alarms.create(buildAlarmName(tabId, i), {
                delayInMinutes: ALARM_DELAYS[i] / 60000,
              });
            } catch (error) {
              console.debug(`Failed to create alarm for tab ${tabId} attempt ${i}:`, error);
            }
          }
        })();
      }
    }
  );
}
