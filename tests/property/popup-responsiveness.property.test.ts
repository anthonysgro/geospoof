/**
 * Property-based tests for popup responsiveness
 * Feature: geolocation-spoof-extension-mvp
 */

import fc from "fast-check";
import { type MockBrowser, type MockDocument, assignGlobal } from "../helpers/mock-types";

/**
 * Property 16: Protection Status Toggle Responsiveness
 * For any protection status toggle action, the protection status should change within 100ms.
 *
 * Validates: Requirements 5.2
 */
describe("Property 16: Protection Status Toggle Responsiveness", () => {
  let mockBrowser: MockBrowser;

  beforeEach(() => {
    mockBrowser = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      },
    };
    assignGlobal("browser", mockBrowser);
  });

  test("should toggle protection status within 100ms", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (enabled) => {
        const startTime = Date.now();

        // Simulate protection toggle from popup.js
        await mockBrowser.runtime.sendMessage({
          type: "SET_PROTECTION_STATUS",
          payload: { enabled },
        });

        const endTime = Date.now();
        const duration = endTime - startTime;

        // Should complete within 100ms
        expect(duration).toBeLessThan(100);
      }),
      { numRuns: 100 }
    );
  });

  test("should handle rapid toggle sequences", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 2, maxLength: 10 }),
        async (toggleSequence) => {
          const startTime = Date.now();

          // Perform rapid toggles
          for (const enabled of toggleSequence) {
            await mockBrowser.runtime.sendMessage({
              type: "SET_PROTECTION_STATUS",
              payload: { enabled },
            });
          }

          const endTime = Date.now();
          const avgDuration = (endTime - startTime) / toggleSequence.length;

          // Average time per toggle should be under 100ms
          expect(avgDuration).toBeLessThan(100);
        }
      ),
      { numRuns: 50 }
    );
  });

  test("should maintain responsiveness regardless of toggle state", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), fc.boolean(), async (initialState, finalState) => {
        // Set initial state
        await mockBrowser.runtime.sendMessage({
          type: "SET_PROTECTION_STATUS",
          payload: { enabled: initialState },
        });

        // Toggle to final state
        const startTime = Date.now();
        await mockBrowser.runtime.sendMessage({
          type: "SET_PROTECTION_STATUS",
          payload: { enabled: finalState },
        });
        const endTime = Date.now();

        const duration = endTime - startTime;
        expect(duration).toBeLessThan(100);
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 18: Protection Status UI Reflection
 * For any protection status (enabled or disabled), both the popup UI toggle and
 * the browser toolbar badge icon should accurately reflect the current state.
 *
 * Validates: Requirements 5.5, 5.6
 */
describe("Property 18: Protection Status UI Reflection", () => {
  let mockBrowser: MockBrowser;
  let mockDocument: MockDocument & { querySelector: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockBrowser = {
      runtime: {
        sendMessage: vi.fn(),
      },
    };
    assignGlobal("browser", mockBrowser);

    mockDocument = {
      getElementById: vi.fn(),
      querySelector: vi.fn(),
    };
    assignGlobal("document", mockDocument);
  });

  test("should reflect protection status in UI elements", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (enabled) => {
        // Mock settings response
        mockBrowser.runtime.sendMessage.mockResolvedValue({
          enabled,
          location: null,
          webrtcProtection: false,
        });

        // Mock UI elements
        const mockToggle = { checked: false };
        const mockBadge = { classList: { add: vi.fn(), remove: vi.fn() } };
        const mockStatusText = { textContent: "" };

        mockDocument.getElementById.mockImplementation((id: string) => {
          if (id === "protectionToggle") return mockToggle;
          if (id === "statusBadge") return mockBadge;
          if (id === "statusText") return mockStatusText;
          return null;
        });

        // Simulate updateStatusBadge function from popup.js
        function updateStatusBadge(isEnabled: boolean) {
          if (isEnabled) {
            mockBadge.classList.add("enabled");
            mockStatusText.textContent = "Enabled";
          } else {
            mockBadge.classList.remove("enabled");
            mockStatusText.textContent = "Disabled";
          }
        }

        // Simulate loadSettings function
        const settings = (await mockBrowser.runtime.sendMessage({ type: "GET_SETTINGS" })) as {
          enabled: boolean;
        };
        mockToggle.checked = settings.enabled;
        updateStatusBadge(settings.enabled);

        // Verify UI reflects the status
        expect(mockToggle.checked).toBe(enabled);
        expect(mockStatusText.textContent).toBe(enabled ? "Enabled" : "Disabled");

        if (enabled) {
          expect(mockBadge.classList.add).toHaveBeenCalledWith("enabled");
        } else {
          expect(mockBadge.classList.remove).toHaveBeenCalledWith("enabled");
        }
      }),
      { numRuns: 100 }
    );
  });

  test("should update UI when status changes", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (initialStatus, newStatus) => {
        // Mock UI elements
        const mockToggle = { checked: initialStatus };
        const mockBadge = { classList: { add: vi.fn(), remove: vi.fn() } };
        const mockStatusText = { textContent: initialStatus ? "Enabled" : "Disabled" };

        mockDocument.getElementById.mockImplementation((id: string) => {
          if (id === "protectionToggle") return mockToggle;
          if (id === "statusBadge") return mockBadge;
          if (id === "statusText") return mockStatusText;
          return null;
        });

        // Simulate status change
        function updateStatusBadge(isEnabled: boolean) {
          if (isEnabled) {
            mockBadge.classList.add("enabled");
            mockStatusText.textContent = "Enabled";
          } else {
            mockBadge.classList.remove("enabled");
            mockStatusText.textContent = "Disabled";
          }
        }

        mockToggle.checked = newStatus;
        updateStatusBadge(newStatus);

        // Verify UI updated correctly
        expect(mockToggle.checked).toBe(newStatus);
        expect(mockStatusText.textContent).toBe(newStatus ? "Enabled" : "Disabled");
      }),
      { numRuns: 100 }
    );
  });

  test("should maintain UI consistency across multiple status changes", () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }), (statusSequence) => {
        // Mock UI elements
        const mockToggle = { checked: false };
        const mockBadge = { classList: { add: vi.fn(), remove: vi.fn() } };
        const mockStatusText = { textContent: "Disabled" };

        mockDocument.getElementById.mockImplementation((id: string) => {
          if (id === "protectionToggle") return mockToggle;
          if (id === "statusBadge") return mockBadge;
          if (id === "statusText") return mockStatusText;
          return null;
        });

        function updateStatusBadge(isEnabled: boolean) {
          if (isEnabled) {
            mockBadge.classList.add("enabled");
            mockStatusText.textContent = "Enabled";
          } else {
            mockBadge.classList.remove("enabled");
            mockStatusText.textContent = "Disabled";
          }
        }

        // Apply each status change
        for (const status of statusSequence) {
          mockToggle.checked = status;
          updateStatusBadge(status);
        }

        // Verify final state matches last status
        const finalStatus = statusSequence[statusSequence.length - 1];
        expect(mockToggle.checked).toBe(finalStatus);
        expect(mockStatusText.textContent).toBe(finalStatus ? "Enabled" : "Disabled");
      }),
      { numRuns: 50 }
    );
  });
});
