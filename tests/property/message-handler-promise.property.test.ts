/**
 * Property-Based Tests for Message Handler Promise Pattern
 * Feature: extension-hardening, Property 6 & 7: Message Handler Returns Resolved Promise
 *
 * Property 6: For any valid message type, handleMessage returns a Promise
 * that resolves with a non-undefined value.
 * Validates: Requirements 6.1, 6.2
 *
 * Property 7: For any message causing an internal error, handleMessage returns
 * a resolved Promise with an { error: string } object.
 * Validates: Requirements 6.3
 */

import fc from "fast-check";
import type { Message } from "@/shared/types/messages";
import { importBackground } from "../helpers/import-background";

/** Arbitrary for valid messages that handleMessage can process. */
const validMessageArb: fc.Arbitrary<Message> = fc.oneof(
  fc.constant<Message>({ type: "GET_SETTINGS" }),
  fc.record({
    type: fc.constant("SET_LOCATION" as const),
    payload: fc.record({
      latitude: fc.double({ min: -90, max: 90, noNaN: true }),
      longitude: fc.double({ min: -180, max: 180, noNaN: true }),
    }),
  }),
  fc.record({
    type: fc.constant("SET_PROTECTION_STATUS" as const),
    payload: fc.record({ enabled: fc.boolean() }),
  }),
  fc.record({
    type: fc.constant("SET_WEBRTC_PROTECTION" as const),
    payload: fc.record({ enabled: fc.boolean() }),
  }),
  fc.record({
    type: fc.constant("GEOCODE_QUERY" as const),
    payload: fc.record({
      query: fc.string({ minLength: 3, maxLength: 50 }),
    }),
  }),
  fc.constant<Message>({ type: "COMPLETE_ONBOARDING" }),
  fc.record({
    type: fc.constant("CHECK_TAB_INJECTION" as const),
    payload: fc.record({ tabId: fc.integer({ min: 1, max: 10000 }) }),
  })
);

/** Fake MessageSender for tests. */
const fakeSender = {} as browser.runtime.MessageSender;

describe("Message Handler Promise Properties", () => {
  /**
   * Property 6: Message Handler Returns Resolved Promise
   *
   * For any valid message type, handleMessage returns a Promise that
   * resolves (does not reject) with a non-undefined value.
   */
  test("Property 6: Message Handler Returns Resolved Promise", async () => {
    await fc.assert(
      fc.asyncProperty(validMessageArb, async (message: Message) => {
        vi.clearAllMocks();

        // Mock fetch for geocoding/timezone calls
        const fetchFn = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
        fetchFn.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              timezoneId: "America/New_York",
              rawOffset: -5,
              dstOffset: -4,
            }),
          text: () => Promise.resolve(""),
        });

        // Mock tabs for broadcast
        const tabsQueryMock = browser.tabs.query as unknown as ReturnType<typeof vi.fn>;
        tabsQueryMock.mockResolvedValue([]);

        const tabsSendMock = browser.tabs.sendMessage as unknown as ReturnType<typeof vi.fn>;
        tabsSendMock.mockResolvedValue(undefined);

        const bg = await importBackground();
        const result = await bg.handleMessage(message, fakeSender);

        // Must resolve (not reject) and return a non-undefined value
        expect(result).not.toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: Message Handler Error Path Returns Error Object
   *
   * For any message that causes an internal error during processing,
   * handleMessage returns a resolved Promise with an { error: string } object.
   */
  test("Property 7: Message Handler Error Path Returns Error Object", async () => {
    // Generate arbitrary unknown message types that will hit the default branch
    const unknownTypeArb = fc
      .string({ minLength: 1, maxLength: 30 })
      .filter(
        (s) =>
          ![
            "GET_SETTINGS",
            "SET_LOCATION",
            "SET_PROTECTION_STATUS",
            "SET_WEBRTC_PROTECTION",
            "GEOCODE_QUERY",
            "COMPLETE_ONBOARDING",
            "CHECK_TAB_INJECTION",
            "PING",
            "UPDATE_SETTINGS",
          ].includes(s)
      );

    await fc.assert(
      fc.asyncProperty(unknownTypeArb, async (messageType) => {
        vi.clearAllMocks();

        const bg = await importBackground();

        const message = { type: messageType } as unknown as Message;

        // Unknown message types should resolve with { error: string }
        const result = await bg.handleMessage(message, fakeSender);

        expect(result).toBeDefined();
        expect(result).toHaveProperty("error");
        expect(typeof (result as { error: string }).error).toBe("string");
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7b: Known message types that throw internally still resolve
   * with an { error: string } object rather than rejecting.
   */
  test("Property 7b: Internal errors resolve with error object", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant("SET_LOCATION"), async () => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        // loadSettings succeeds but saveSettings throws
        const local = browser.storage.local as unknown as Record<string, unknown>;
        (local["set"] as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error("disk full");
        });

        // fetch throws for timezone lookup
        (globalThis as unknown as Record<string, unknown>)["fetch"] = vi.fn(() => {
          throw new Error("network down");
        });

        const bg = await importBackground();

        const message: Message = {
          type: "SET_LOCATION",
          payload: { latitude: 40, longitude: -74 },
        };

        // Run the handler while advancing timers to skip retry delays
        const resultPromise = bg.handleMessage(message, fakeSender);
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result).toBeDefined();
        expect(result).toHaveProperty("error");
        expect(typeof (result as { error: string }).error).toBe("string");

        vi.useRealTimers();
      }),
      { numRuns: 100 }
    );
  });
});
