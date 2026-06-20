/**
 * jsdom tests for the popup accuracy control's edit/display toggle behavior.
 *
 * The Custom control has two states: an editing row `[ input ][ Set ]` and a
 * compact display row `±{meters}m  [ Edit ]`. The Custom value commits ONLY
 * when the user clicks "Set" or presses Enter — never on blur, never on mere
 * selection of "Custom", and never on every keystroke. Selecting "Custom"
 * opens the editing row pre-filled with the currently-resolved accuracy.
 * Committing switches to the display row; clicking "Edit" returns to editing.
 * Presets still apply immediately and hide the whole wrapper.
 *
 * Validates: Requirements 9.2, 9.3
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { initAccuracyControl, restoreAccuracyControl } from "@/popup/accuracy";

/** Build the minimal accuracy-control markup used by the popup. */
function mountAccuracyControl(): void {
  document.body.innerHTML = `
    <div class="accuracy-selector">
      <label class="select-label" for="accuracySelect">
        <span>Location Accuracy</span>
        <select id="accuracySelect">
          <option value="realistic">Realistic</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <div class="accuracy-custom-edit" id="accuracyCustomEdit" style="display: none">
        <input type="number" id="accuracyCustomInput" min="1" max="10000" step="1" />
        <button type="button" id="accuracyCustomConfirm" class="accuracy-custom-confirm">Set</button>
      </div>
      <div class="accuracy-custom-display" id="accuracyCustomDisplay" style="display: none">
        <span id="accuracyCustomValue"></span>
        <button type="button" id="accuracyCustomEditBtn" class="accuracy-custom-confirm">Edit</button>
      </div>
      <div class="accuracy-custom-hint" id="accuracyCustomHint" style="display: none"></div>
    </div>
  `;
}

function getSelect(): HTMLSelectElement {
  return document.getElementById("accuracySelect") as HTMLSelectElement;
}

function getInput(): HTMLInputElement {
  return document.getElementById("accuracyCustomInput") as HTMLInputElement;
}

function getConfirm(): HTMLButtonElement {
  return document.getElementById("accuracyCustomConfirm") as HTMLButtonElement;
}

function getEditBtn(): HTMLButtonElement {
  return document.getElementById("accuracyCustomEditBtn") as HTMLButtonElement;
}

function getEditRow(): HTMLElement {
  return document.getElementById("accuracyCustomEdit") as HTMLElement;
}

function getDisplayRow(): HTMLElement {
  return document.getElementById("accuracyCustomDisplay") as HTMLElement;
}

function getValueLabel(): HTMLElement {
  return document.getElementById("accuracyCustomValue") as HTMLElement;
}

/** Select an option and fire the `change` event the control listens for. */
function selectOption(value: string): void {
  const select = getSelect();
  select.value = value;
  select.dispatchEvent(new Event("change"));
}

/** Spy on the mocked `browser.runtime.sendMessage`. */
function sendSpy() {
  return browser.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>;
}

describe("accuracy control edit/display toggle (jsdom)", () => {
  beforeEach(() => {
    mountAccuracyControl();
    initAccuracyControl();
  });

  it("opens the editing row pre-filled from the resolved value and sends nothing on select", () => {
    // Resolved accuracy currently in effect is 72m (auto/realistic stored).
    restoreAccuracyControl({ mode: "auto" }, 72);

    selectOption("custom");

    expect(getInput().value).toBe("72");
    expect(getEditRow().style.display).toBe("flex");
    expect(getDisplayRow().style.display).toBe("none");
    expect(sendSpy()).not.toHaveBeenCalled();
  });

  it("clicking Set commits the typed value and switches to the display row", () => {
    restoreAccuracyControl({ mode: "auto" }, 50);
    selectOption("custom");
    sendSpy().mockClear();

    getInput().value = "250";
    getConfirm().click();

    expect(sendSpy()).toHaveBeenCalledTimes(1);
    expect(sendSpy()).toHaveBeenCalledWith({
      type: "SET_ACCURACY",
      payload: { accuracySetting: { mode: "fixed", meters: 250 } },
    });
    // Editing row hidden, display row shown with ±{meters}m.
    expect(getEditRow().style.display).toBe("none");
    expect(getDisplayRow().style.display).toBe("flex");
    expect(getValueLabel().textContent).toBe("±250m");
  });

  it("clicking Set rejects an above-range value: no send, stays editing, shows invalid", () => {
    restoreAccuracyControl({ mode: "auto" }, 50);
    selectOption("custom");
    sendSpy().mockClear();

    getInput().value = "99999";
    getConfirm().click();

    // Nothing is sent and the editor stays open with the entered value intact.
    expect(sendSpy()).not.toHaveBeenCalled();
    expect(getEditRow().style.display).toBe("flex");
    expect(getDisplayRow().style.display).toBe("none");
    expect(getInput().value).toBe("99999");
    // The red-outline invalid indication + hint are surfaced.
    expect(getInput().classList.contains("invalid")).toBe(true);
    expect(document.getElementById("accuracyCustomHint")!.style.display).toBe("block");
  });

  it("clicking Set rejects a below-range value: no send, stays editing, shows invalid", () => {
    restoreAccuracyControl({ mode: "auto" }, 50);
    selectOption("custom");
    sendSpy().mockClear();

    getInput().value = "0";
    getConfirm().click();

    expect(sendSpy()).not.toHaveBeenCalled();
    expect(getEditRow().style.display).toBe("flex");
    expect(getDisplayRow().style.display).toBe("none");
    expect(getInput().value).toBe("0");
    expect(getInput().classList.contains("invalid")).toBe(true);
    expect(document.getElementById("accuracyCustomHint")!.style.display).toBe("block");
  });

  it("clicking Set rounds an in-range fractional value before sending", () => {
    restoreAccuracyControl({ mode: "auto" }, 50);
    selectOption("custom");
    sendSpy().mockClear();

    getInput().value = "50.7";
    getConfirm().click();

    expect(sendSpy()).toHaveBeenCalledTimes(1);
    expect(sendSpy()).toHaveBeenCalledWith({
      type: "SET_ACCURACY",
      payload: { accuracySetting: { mode: "fixed", meters: 51 } },
    });
    expect(getEditRow().style.display).toBe("none");
    expect(getDisplayRow().style.display).toBe("flex");
    expect(getValueLabel().textContent).toBe("±51m");
  });

  it("clicking Edit reopens the editing row pre-filled with the committed meters", () => {
    restoreAccuracyControl({ mode: "auto" }, 50);
    selectOption("custom");

    getInput().value = "300";
    getConfirm().click();
    expect(getDisplayRow().style.display).toBe("flex");

    sendSpy().mockClear();
    getEditBtn().click();

    expect(getEditRow().style.display).toBe("flex");
    expect(getDisplayRow().style.display).toBe("none");
    expect(getInput().value).toBe("300");
    expect(sendSpy()).not.toHaveBeenCalled();
  });

  it("an empty/invalid entry stays in the editing row and sends nothing", () => {
    restoreAccuracyControl({ mode: "auto" }, 50);
    selectOption("custom");
    sendSpy().mockClear();

    getInput().value = "";
    getConfirm().click();

    expect(sendSpy()).not.toHaveBeenCalled();
    expect(getEditRow().style.display).toBe("flex");
    expect(getDisplayRow().style.display).toBe("none");
    expect(document.getElementById("accuracyCustomHint")!.style.display).toBe("block");
  });

  it("pressing Enter in the input commits the value", () => {
    restoreAccuracyControl({ mode: "auto" }, 50);
    selectOption("custom");
    sendSpy().mockClear();

    getInput().value = "123";
    getInput().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(sendSpy()).toHaveBeenCalledWith({
      type: "SET_ACCURACY",
      payload: { accuracySetting: { mode: "fixed", meters: 123 } },
    });
    expect(getValueLabel().textContent).toBe("±123m");
  });

  it("does NOT commit on blur", () => {
    restoreAccuracyControl({ mode: "auto" }, 50);
    selectOption("custom");
    sendSpy().mockClear();

    getInput().value = "321";
    getInput().dispatchEvent(new Event("blur"));

    expect(sendSpy()).not.toHaveBeenCalled();
  });

  it("does NOT commit on every keystroke (input event)", () => {
    restoreAccuracyControl({ mode: "auto" }, 50);
    selectOption("custom");
    sendSpy().mockClear();

    getInput().value = "3";
    getInput().dispatchEvent(new Event("input"));

    expect(sendSpy()).not.toHaveBeenCalled();
  });

  it("applies the Realistic preset immediately on selection and hides the wrapper", () => {
    // Start on Custom (display row visible), then switch to Realistic.
    restoreAccuracyControl({ mode: "fixed", meters: 200 }, 200);
    expect(getDisplayRow().style.display).toBe("flex");
    sendSpy().mockClear();

    selectOption("realistic");

    expect(sendSpy()).toHaveBeenCalledTimes(1);
    expect(sendSpy()).toHaveBeenCalledWith({
      type: "SET_ACCURACY",
      payload: { accuracySetting: { mode: "auto" } },
    });
    expect(getEditRow().style.display).toBe("none");
    expect(getDisplayRow().style.display).toBe("none");
  });

  it("restores a stored fixed setting directly into the display row (editor closed)", () => {
    // For a fixed setting the resolved value equals the stored meters.
    restoreAccuracyControl({ mode: "fixed", meters: 137 }, 137);

    expect(getDisplayRow().style.display).toBe("flex");
    expect(getEditRow().style.display).toBe("none");
    expect(getValueLabel().textContent).toBe("±137m");
    expect(sendSpy()).not.toHaveBeenCalled();

    // Clicking Edit reopens editing pre-filled with the committed meters.
    getEditBtn().click();
    expect(getEditRow().style.display).toBe("flex");
    expect(getInput().value).toBe("137");
  });
});
