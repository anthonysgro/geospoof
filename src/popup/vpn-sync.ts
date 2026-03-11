/**
 * Popup VPN Sync Logic
 * Handles VPN sync tab UI interactions: sync, display, loading, and error states.
 */

import type { SyncVpnSuccessResponse, SyncVpnErrorResponse } from "@/shared/types/messages";
import { loadSettings } from "./settings";

/**
 * Initiate a VPN sync from the popup.
 * Shows loading state, sends SYNC_VPN message, handles response.
 */
export async function handleVpnSync(forceRefresh: boolean): Promise<void> {
  setVpnSyncLoading(true);
  hideVpnSyncError();

  try {
    const response = (await browser.runtime.sendMessage({
      type: "SYNC_VPN",
      payload: { forceRefresh },
    })) as SyncVpnSuccessResponse | SyncVpnErrorResponse;

    if ("error" in response) {
      displayVpnSyncError(response);
    } else {
      displayVpnSyncResult(response);
      await loadSettings();
    }
  } catch (error: unknown) {
    console.error("VPN sync failed:", error);
    displayVpnSyncError({
      error: "NETWORK",
      message: "A network error occurred. Please try again.",
    });
  } finally {
    setVpnSyncLoading(false);
  }
}

/**
 * Update the VPN sync panel UI with a successful result.
 */
export function displayVpnSyncResult(result: SyncVpnSuccessResponse): void {
  const statusEl = document.getElementById("vpnSyncStatus");
  const ipEl = document.getElementById("vpnSyncIp");
  const syncBtn = document.getElementById("vpnSyncButton");
  const resyncBtn = document.getElementById("vpnResyncButton");

  if (statusEl) statusEl.style.display = "block";
  if (ipEl) ipEl.textContent = `Detected IP: ${result.ip}`;

  // After first successful sync, hide "Sync Now" and show "Re-sync"
  if (syncBtn) syncBtn.style.display = "none";
  if (resyncBtn) resyncBtn.style.display = "block";

  hideVpnSyncError();
}

/**
 * Show error state in the VPN sync panel.
 */
export function displayVpnSyncError(error: SyncVpnErrorResponse): void {
  const errorEl = document.getElementById("vpnSyncError");
  if (errorEl) {
    errorEl.style.display = "block";
    errorEl.textContent = error.message;
  }

  // Re-enable re-sync button so user can retry
  const resyncBtn = document.getElementById("vpnResyncButton") as HTMLButtonElement | null;
  if (resyncBtn && resyncBtn.style.display !== "none") {
    resyncBtn.disabled = false;
  }
}

/**
 * Hide the error display.
 */
function hideVpnSyncError(): void {
  const errorEl = document.getElementById("vpnSyncError");
  if (errorEl) errorEl.style.display = "none";
}

/**
 * Set loading state on the VPN sync panel.
 * Toggles loading indicator and disables/enables buttons during sync.
 */
export function setVpnSyncLoading(loading: boolean): void {
  const syncBtn = document.getElementById("vpnSyncButton") as HTMLButtonElement | null;
  const resyncBtn = document.getElementById("vpnResyncButton") as HTMLButtonElement | null;

  if (syncBtn) {
    syncBtn.disabled = loading;
    syncBtn.classList.toggle("loading", loading);
  }
  if (resyncBtn) {
    resyncBtn.disabled = loading;
    resyncBtn.classList.toggle("loading", loading);
  }
}
