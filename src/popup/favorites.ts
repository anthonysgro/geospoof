/**
 * Popup Favorites
 * UI logic for the saved favorites feature: star button, chip row, and related interactions.
 */

import type { Favorite, Location, LocationName, Settings } from "@/shared/types/settings";
import type {
  SaveFavoritePayload,
  RemoveFavoritePayload,
  RenameFavoritePayload,
  FavoriteResponse,
} from "@/shared/types/messages";
import { loadSettings } from "./settings";

// ── Module-level timer state ──────────────────────────────────────────────────

let capacityHideTimer: ReturnType<typeof setTimeout> | null = null;

// ── Pure Utility Functions ────────────────────────────────────────────────────

/**
 * Round a coordinate value to 4 decimal places.
 * Used for deduplication and active-chip matching (Requirements 10.2, 1.5).
 */
export function roundCoord(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Check whether a location matches any entry in the favorites list.
 * Comparison is performed on coordinates rounded to 4 decimal places.
 * Returns the first matching Favorite, or null if none match.
 * (Requirements 10.2, 1.5)
 */
export function isFavorite(
  location: { latitude: number; longitude: number },
  favorites: Favorite[]
): Favorite | null {
  const lat = roundCoord(location.latitude);
  const lon = roundCoord(location.longitude);
  return (
    favorites.find((f) => roundCoord(f.latitude) === lat && roundCoord(f.longitude) === lon) ?? null
  );
}

/**
 * Resolve the display text for a chip.
 * Priority order (Requirements 6.1, 6.2, 6.3):
 *   1. `label` — if non-empty after trimming
 *   2. `city`  — if non-empty
 *   3. `displayName` truncated to 20 characters, with "…" appended if truncated
 */
export function getChipDisplayText(favorite: Favorite): string {
  if (favorite.label !== null && favorite.label.trim().length > 0) {
    return favorite.label;
  }
  if (favorite.city.length > 0) {
    return favorite.city;
  }
  const name = favorite.displayName;
  if (name.length > 20) {
    return name.slice(0, 20) + "…";
  }
  return name;
}

// ── Star Button ───────────────────────────────────────────────────────────────

/**
 * Render or update the star button based on current location and favorites list.
 * Hides the button when no location is set or VPN sync is active.
 * Wires the click handler idempotently via cloneNode.
 * (Requirements 1.1, 1.2, 1.5, 9.3)
 */
export function renderStarButton(
  location: Location | null,
  favorites: Favorite[],
  vpnSyncEnabled: boolean,
  locationName: LocationName | null
): void {
  const btn = document.getElementById("starFavoriteBtn") as HTMLButtonElement | null;
  if (!btn) return;

  // Hide when no location or VPN sync is active (Req 1.2)
  if (!location || vpnSyncEnabled) {
    btn.style.display = "none";
    return;
  }

  // Show: clear inline display so CSS (`display: inline-flex`) wins.
  btn.style.display = "";

  const match = isFavorite(location, favorites);

  if (match) {
    // Saved state (Req 1.5, 9.3)
    btn.classList.add("saved");
    btn.setAttribute("aria-label", "Remove from favorites");
  } else {
    // Unsaved state (Req 1.5, 9.3)
    btn.classList.remove("saved");
    btn.setAttribute("aria-label", "Save as favorite");
  }

  // Wire click handler idempotently: replace the node to remove old listeners
  const newBtn = btn.cloneNode(true) as HTMLButtonElement;
  btn.parentNode?.replaceChild(newBtn, btn);

  newBtn.addEventListener("click", () => {
    void handleStarClick(location, locationName, favorites);
  });
}

// ── Handle Star Click ─────────────────────────────────────────────────────────

/**
 * Handle star button click: save or remove the active location as a favorite.
 * (Requirements 1.3, 1.4, 7.1)
 */
export async function handleStarClick(
  location: Location,
  locationName: LocationName | null,
  favorites: Favorite[]
): Promise<void> {
  const match = isFavorite(location, favorites);

  if (match) {
    // Already a favorite — remove it (Req 1.4)
    const payload: RemoveFavoritePayload = { id: match.id };
    try {
      const response = (await browser.runtime.sendMessage({
        type: "REMOVE_FAVORITE",
        payload,
      })) as FavoriteResponse;

      if ("success" in response && response.success) {
        await loadSettings();
      } else if ("error" in response) {
        console.error("REMOVE_FAVORITE error:", response.error);
      }
    } catch (err: unknown) {
      console.error("Failed to send REMOVE_FAVORITE:", err);
    }
  } else {
    // Not a favorite — save it (Req 1.3)
    const city = locationName?.city ?? "";
    const country = locationName?.country ?? "";
    const rawDisplayName =
      locationName?.displayName ??
      `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
    const displayName = rawDisplayName.slice(0, 100);

    const savePayload: SaveFavoritePayload = {
      id: Date.now().toString(),
      latitude: location.latitude,
      longitude: location.longitude,
      city,
      country,
      displayName,
      label: null,
    };

    try {
      const response = (await browser.runtime.sendMessage({
        type: "SAVE_FAVORITE",
        payload: savePayload,
      })) as FavoriteResponse;

      if ("success" in response && response.success) {
        // Req 1.3: reload to reflect saved state
        await loadSettings();
      } else if ("error" in response) {
        if (response.error === "AT_CAPACITY") {
          // Req 7.1: show inline capacity message
          showCapacityMessage();
        } else if (response.error === "STORAGE_ERROR") {
          // Log and no-op (Req 8.4)
          console.error("SAVE_FAVORITE storage error");
        }
      }
    } catch (err: unknown) {
      console.error("Failed to send SAVE_FAVORITE:", err);
    }
  }
}

// ── Capacity Message ──────────────────────────────────────────────────────────

/**
 * Show the AT_CAPACITY inline message for 3 seconds.
 * (Requirement 7.1, 7.2)
 */
export function showCapacityMessage(): void {
  const msg = document.getElementById("favoritesCapacityMsg");
  if (!msg) return;

  msg.style.display = "inline";

  // Clear any existing hide timer (Req 7.2)
  if (capacityHideTimer !== null) {
    clearTimeout(capacityHideTimer);
  }

  capacityHideTimer = setTimeout(() => {
    hideCapacityMessage();
  }, 3000);
}

/**
 * Hide the AT_CAPACITY inline message immediately.
 * (Requirement 7.3)
 */
export function hideCapacityMessage(): void {
  const msg = document.getElementById("favoritesCapacityMsg");
  if (msg) {
    msg.style.display = "none";
  }

  if (capacityHideTimer !== null) {
    clearTimeout(capacityHideTimer);
    capacityHideTimer = null;
  }
}

// ── Forward References (implemented in tasks 6.10 and 6.14) ──────────────────

/**
 * Handle chip click: set location to the favorite's coordinates.
 * (Requirements 3.5, 3.6)
 */
async function handleChipClick(favorite: Favorite): Promise<void> {
  try {
    await browser.runtime.sendMessage({
      type: "SET_LOCATION",
      payload: { latitude: favorite.latitude, longitude: favorite.longitude },
    });
    await loadSettings();
  } catch (err: unknown) {
    console.error("Failed to set location from favorite:", err);
  }
}

/**
 * Handle chip remove button click: send REMOVE_FAVORITE and update DOM.
 * On success: removes chip from DOM, hides row if empty, clears capacity message.
 * On error: chip stays in DOM (no-op).
 * (Requirements 5.3, 5.4, 5.5)
 */
async function handleChipRemove(favorite: Favorite, chipEl: HTMLElement): Promise<void> {
  const payload: RemoveFavoritePayload = { id: favorite.id };
  try {
    const response = (await browser.runtime.sendMessage({
      type: "REMOVE_FAVORITE",
      payload,
    })) as FavoriteResponse;

    if ("success" in response && response.success) {
      // Remove chip from DOM (Req 5.3, 5.4)
      chipEl.parentNode?.removeChild(chipEl);

      // Hide wrapper if row is now empty (Req 5.4)
      const row = document.getElementById("favoritesChipRow");
      const wrapper = document.getElementById("favoritesChipWrapper");
      if (row && wrapper && row.children.length === 0) {
        wrapper.style.display = "none";
      }

      // Clear any capacity message and re-render star button (Req 7.3)
      hideCapacityMessage();
      await loadSettings();
    }
    // On error: do nothing — chip stays in DOM (Req 5.5)
  } catch (err: unknown) {
    console.error("Failed to send REMOVE_FAVORITE:", err);
    // Chip stays in DOM on network/runtime error (Req 5.5)
  }
}

function enterRenameMode(favorite: Favorite, chipEl: HTMLElement, labelEl: HTMLElement): void {
  // Already in rename mode — don't stack inputs
  if (chipEl.querySelector(".chip-rename-input")) return;

  const currentDisplayText = getChipDisplayText(favorite);

  // ── Input ──────────────────────────────────────────────────────
  const input = document.createElement("input");
  input.className = "chip-rename-input";
  input.type = "text";
  input.value = currentDisplayText;
  input.maxLength = 50;

  // Size the input to exactly fit its text content using a hidden mirror span
  const mirror = document.createElement("span");
  mirror.className = "chip-rename-mirror";
  mirror.style.cssText =
    "position:absolute;visibility:hidden;white-space:pre;font-size:13px;font-weight:500;font-family:inherit;";
  document.body.appendChild(mirror);

  const syncWidth = (): void => {
    mirror.textContent = input.value || " ";
    input.style.width = `${mirror.offsetWidth + 2}px`;
  };

  syncWidth();
  input.addEventListener("input", syncWidth);

  // Clean up mirror when done
  const removeMirror = (): void => mirror.remove();

  // ── Confirm button ─────────────────────────────────────────────
  const confirmBtn = document.createElement("button");
  confirmBtn.className = "chip-confirm-btn";
  confirmBtn.setAttribute("aria-label", "Confirm rename");
  confirmBtn.textContent = "✓";

  labelEl.textContent = "";
  labelEl.appendChild(input);

  const menuBtn = chipEl.querySelector(".chip-menu-btn");
  if (menuBtn) {
    chipEl.insertBefore(confirmBtn, menuBtn);
  } else {
    chipEl.appendChild(confirmBtn);
  }

  input.focus();
  input.select();

  let done = false;

  const confirm = (): void => {
    if (done) return;
    done = true;
    confirmBtn.remove();
    removeMirror();

    const trimmedValue = input.value.trim();
    const payload: RenameFavoritePayload = { id: favorite.id, label: trimmedValue };
    browser.runtime.sendMessage({ type: "RENAME_FAVORITE", payload }).then(
      (response) => {
        const res = response as FavoriteResponse;
        if ("success" in res && res.success) {
          void loadSettings();
        } else {
          labelEl.textContent = currentDisplayText;
          if ("error" in res) console.error("RENAME_FAVORITE error:", res.error);
        }
      },
      (err: unknown) => {
        labelEl.textContent = currentDisplayText;
        console.error("Failed to send RENAME_FAVORITE:", err);
      }
    );
  };

  const cancel = (): void => {
    if (done) return;
    done = true;
    confirmBtn.remove();
    removeMirror();
    labelEl.textContent = currentDisplayText;
  };

  confirmBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
  });
  confirmBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    confirm();
  });

  input.addEventListener("keydown", (e: KeyboardEvent) => {
    // Stop propagation so chip-level Delete/Backspace/Enter don't fire
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      confirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });

  // Cancel only if focus leaves the chip entirely
  input.addEventListener("blur", (e: FocusEvent) => {
    const relatedTarget = e.relatedTarget as Node | null;
    if (!relatedTarget || !chipEl.contains(relatedTarget)) {
      cancel();
    }
  });
}

// ── Chip Menu ─────────────────────────────────────────────────────────────────

/** Close and remove any open chip dropdown menus. */
function closeAllChipMenus(): void {
  document.querySelectorAll(".chip-dropdown").forEach((el) => el.remove());
}

/**
 * Open a dropdown action menu for a chip (Rename / Delete).
 * Appended to document.body and positioned with fixed coords to escape
 * the overflow:auto chip row container.
 * Clicking outside or pressing Escape closes it.
 */
function openChipMenu(
  favorite: Favorite,
  chipEl: HTMLElement,
  labelEl: HTMLElement,
  menuBtn: HTMLElement
): void {
  // Close any already-open menu first
  closeAllChipMenus();

  const dropdown = document.createElement("div");
  dropdown.className = "chip-dropdown";

  const renameItem = document.createElement("button");
  renameItem.className = "chip-dropdown-item";
  renameItem.textContent = "Rename";
  renameItem.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllChipMenus();
    enterRenameMode(favorite, chipEl, labelEl);
  });

  const deleteItem = document.createElement("button");
  deleteItem.className = "chip-dropdown-item danger";
  deleteItem.textContent = "Delete";
  deleteItem.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllChipMenus();
    void handleChipRemove(favorite, chipEl);
  });

  dropdown.appendChild(renameItem);
  dropdown.appendChild(deleteItem);

  // Append to body so it escapes overflow:auto on the chip row
  document.body.appendChild(dropdown);

  // Position below the menu button using fixed coords
  const rect = menuBtn.getBoundingClientRect();
  dropdown.style.top = `${rect.bottom + 4}px`;
  // Align right edge of dropdown with right edge of button, clamped to viewport
  const dropWidth = 110;
  const left = Math.min(rect.right - dropWidth, window.innerWidth - dropWidth - 4);
  dropdown.style.left = `${Math.max(4, left)}px`;

  // Close on outside click
  const onOutsideClick = (e: MouseEvent): void => {
    if (!dropdown.contains(e.target as Node) && !menuBtn.contains(e.target as Node)) {
      closeAllChipMenus();
      document.removeEventListener("click", onOutsideClick);
      document.removeEventListener("keydown", onKeyDown);
    }
  };
  // Defer so the current click doesn't immediately close it
  setTimeout(() => document.addEventListener("click", onOutsideClick), 0);

  // Close on Escape
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      closeAllChipMenus();
      menuBtn.focus();
      document.removeEventListener("click", onOutsideClick);
      document.removeEventListener("keydown", onKeyDown);
    }
  };
  document.addEventListener("keydown", onKeyDown);
}

// ── Chip Row ─────────────────────────────────────────────────────────────────

/**
 * Render the chip row from the favorites list.
 * Hides the wrapper when the list is empty; shows and populates it otherwise.
 * Applies the `active` CSS class to the chip whose coordinates match `activeLocation`.
 */
function renderChipRow(favorites: Favorite[], activeLocation: Location | null): void {
  const wrapper = document.getElementById("favoritesChipWrapper");
  const row = document.getElementById("favoritesChipRow");
  if (!row || !wrapper) return;

  if (favorites.length === 0) {
    wrapper.style.display = "none";
    while (row.firstChild) row.removeChild(row.firstChild);
    return;
  }

  wrapper.style.display = "block";
  while (row.firstChild) row.removeChild(row.firstChild);

  const activeMatch = activeLocation ? isFavorite(activeLocation, favorites) : null;

  for (const favorite of favorites) {
    const isActive = activeMatch !== null && activeMatch.id === favorite.id;
    const chipEl = buildChip(favorite, isActive);
    row.appendChild(chipEl);
  }

  // Update fade gradients based on scroll position
  const updateFades = (): void => {
    wrapper.classList.toggle("fade-left", row.scrollLeft > 4);
    wrapper.classList.toggle("fade-right", row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
  };

  // Only attach the scroll listener once — guard with a data attribute
  if (!row.dataset.scrollListenerAttached) {
    row.dataset.scrollListenerAttached = "1";
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    row.addEventListener(
      "scroll",
      () => {
        row.classList.add("is-scrolling");
        updateFades();
        if (scrollTimer !== null) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          row.classList.remove("is-scrolling");
          scrollTimer = null;
        }, 600);
      },
      { passive: true }
    );
  }

  // Preserve scroll position across re-renders, update fades after layout
  requestAnimationFrame(updateFades);
}

// ── Chip Builder ──────────────────────────────────────────────────────────────

/**
 * Build a single chip element for a favorite.
 * The chip has a label and a ⋯ menu button (always visible, dimmed at rest).
 * Clicking the menu button opens a Rename / Delete dropdown.
 */
function buildChip(favorite: Favorite, isActive: boolean): HTMLElement {
  const displayText = getChipDisplayText(favorite);

  // ── Chip container ────────────────────────────────────────────────────────
  const chipEl = document.createElement("div");
  chipEl.setAttribute("role", "listitem");
  chipEl.className = isActive ? "favorite-chip active" : "favorite-chip";
  chipEl.tabIndex = 0;

  chipEl.title = favorite.country;
  chipEl.setAttribute("aria-label", `${displayText}${isActive ? ", currently active" : ""}`);

  // ── Label span ────────────────────────────────────────────────────────────
  const labelEl = document.createElement("span");
  labelEl.className = "chip-label";
  labelEl.textContent = displayText;
  chipEl.appendChild(labelEl);

  // ── Menu button (⋯) ──────────────────────────────────────────────────────
  const menuBtn = document.createElement("button");
  menuBtn.className = "chip-menu-btn";
  menuBtn.setAttribute("aria-label", `Options for ${displayText}`);
  menuBtn.tabIndex = -1;
  menuBtn.textContent = "···";
  chipEl.appendChild(menuBtn);

  // ── Event wiring ──────────────────────────────────────────────────────────

  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openChipMenu(favorite, chipEl, labelEl, menuBtn);
  });

  chipEl.addEventListener("click", (e) => {
    // Don't activate location if rename input is active
    if (chipEl.querySelector(".chip-rename-input")) return;
    // Don't activate if the click was on the menu button (it has its own handler)
    if (menuBtn.contains(e.target as Node)) return;
    void handleChipClick(favorite);
  });

  chipEl.addEventListener("dblclick", () => {
    if (chipEl.querySelector(".chip-rename-input")) return;
    closeAllChipMenus();
    enterRenameMode(favorite, chipEl, labelEl);
  });

  chipEl.addEventListener("keydown", (e: KeyboardEvent) => {
    // Don't intercept keys while the rename input is active
    if (chipEl.querySelector(".chip-rename-input")) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      void handleChipClick(favorite);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      void handleChipRemove(favorite, chipEl);
    }
  });

  return chipEl;
}

// ── Public Entry Point ────────────────────────────────────────────────────────

/**
 * Main entry point called from loadSettings() after settings are received.
 * Renders the star button state and the chip row.
 * (Requirements 1.1, 1.2, 1.5, 2.5)
 */
export function renderFavorites(settings: Settings): void {
  const favorites = settings.favorites ?? [];
  renderStarButton(settings.location, favorites, settings.vpnSyncEnabled, settings.locationName);
  renderChipRow(favorites, settings.location);
}
