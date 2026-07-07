/**
 * Property + unit tests for the toString reject-path stack scrub.
 * Feature: tostring-stack-leak-fix
 *
 * Regression coverage for the extension-id leak where the patched
 * `Function.prototype.toString` (main realm and each iframe realm) threw a
 * `TypeError` on a non-function receiver whose `.stack` carried a
 * `chrome-extension://<id>/…` frame — readable by any page via the
 * `const f = x.toString; f()` detach pattern.
 *
 * The fix delegates the reject case to the original native toString (so the
 * engine produces its genuine builtin frame + per-engine message) and then
 * scrubs only our injected-script frame from the thrown error's stack. This
 * suite locks in three behaviours:
 *
 *  1. The scrub removes exactly the injected-script frames and preserves every
 *     native/page frame, in order — so the surviving stack matches what a clean
 *     browser produces (a naive throw-our-own-error would be a frame short).
 *  2. The reject path still throws the same `TypeError` (type + message) as the
 *     original toString, and rethrows the very same error object.
 *  3. The masked / fallthrough success paths are unchanged by wrapping the
 *     delegation in try/catch.
 *
 * As with the other injected-code suites (tostring-fallthrough,
 * prototype-lie-detection, iframe-tostring), the injected logic is reimplemented
 * here: jsdom cannot run the MAIN-world content script with a real
 * `chrome-extension://` origin, and the real module's `SELF_SCRIPT_URL` is
 * captured from a live extension stack. Reimplementing lets us drive a
 * controllable self-URL through the exact algorithm the fix uses.
 */

"use strict";

import fc from "fast-check";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => any;

const SELF_URL = "chrome-extension://ediefpejhdgbgabmohddjhjochnjggmc/content/injected.js";

/**
 * Faithful reimplementation of `stripExtensionFramesFromStack` with an
 * injectable self-URL (the real one closes over a module const). Removes, in
 * place, any stack line referencing the injected script; no-ops when the
 * self-URL is unknown or the stack isn't a writable string. Duck-typed so a
 * cross-realm error (an object with a string `stack` but not `instanceof Error`)
 * is still scrubbed.
 */
function stripExtensionFramesFromStack(err: unknown, selfUrl: string | null): void {
  if (!selfUrl || err === null || typeof err !== "object") return;
  const e = err as { stack?: unknown };
  if (typeof e.stack !== "string") return;
  const cleaned = e.stack
    .split("\n")
    .filter((line) => !line.includes(selfUrl))
    .join("\n");
  try {
    e.stack = cleaned;
  } catch {
    // stack is non-configurable on some engines — leave it as-is.
  }
}

/**
 * Faithful reimplementation of the patched `toString`: mask registered
 * overrides, otherwise delegate to the original native toString and scrub our
 * injected frames from anything it throws.
 */
function makePatchedToString(
  registry: Map<AnyFunction, string>,
  origToString: typeof Function.prototype.toString,
  origCall: typeof Function.prototype.call,
  selfUrl: string | null
): (this: unknown) => string {
  return function patchedToString(this: unknown): string {
    const nativeName = registry.get(this as AnyFunction);
    if (nativeName !== undefined) {
      return `function ${nativeName}() { [native code] }`;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
      return (origCall as any).call(origToString, this);
    } catch (err) {
      stripExtensionFramesFromStack(err, selfUrl);
      throw err;
    }
  };
}

describe("toString stack scrub — Feature: tostring-stack-leak-fix", () => {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const nativeToString = Function.prototype.toString;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const nativeCall = Function.prototype.call;

  const identifierArb = fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]{0,20}$/);
  const extensionSchemeRe = /(?:chrome-extension|moz-extension|safari-web-extension):\/\//i;

  describe("scrub algorithm", () => {
    test("removes injected-script frames and preserves native + page frames in order", () => {
      const err = {
        stack: [
          "TypeError: Function.prototype.toString requires that 'this' be a Function",
          "    at Object.toString (<anonymous>)",
          `    at toString (${SELF_URL}:1216:44)`,
          "    at https://example.com/app.js:10:5",
        ].join("\n"),
      };

      stripExtensionFramesFromStack(err, SELF_URL);

      expect(err.stack).toBe(
        [
          "TypeError: Function.prototype.toString requires that 'this' be a Function",
          "    at Object.toString (<anonymous>)",
          "    at https://example.com/app.js:10:5",
        ].join("\n")
      );
      // The decisive assertion: no extension origin survives.
      expect(extensionSchemeRe.test(err.stack)).toBe(false);
      // The native builtin frame a clean browser shows is retained.
      expect(err.stack).toContain("at Object.toString (<anonymous>)");
    });

    test("Property: no extension origin survives regardless of how many injected frames are present", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 6 }),
          fc.integer({ min: 1, max: 6 }),
          (nativeFrames, injectedFrames) => {
            const lines = ["TypeError: boom"];
            for (let i = 0; i < nativeFrames; i++) {
              lines.push(`    at nativeFn${i} (<anonymous>)`);
            }
            for (let i = 0; i < injectedFrames; i++) {
              lines.push(`    at ov${i} (${SELF_URL}:${100 + i}:7)`);
            }
            lines.push("    at https://page.example/index.js:3:1");
            const err = { stack: lines.join("\n") };

            stripExtensionFramesFromStack(err, SELF_URL);

            expect(extensionSchemeRe.test(err.stack)).toBe(false);
            // Every non-injected line is preserved.
            expect(err.stack).toContain("TypeError: boom");
            expect(err.stack).toContain("at https://page.example/index.js:3:1");
            for (let i = 0; i < nativeFrames; i++) {
              expect(err.stack).toContain(`at nativeFn${i} (<anonymous>)`);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test("no-op when self-URL is unknown (null)", () => {
      const original = `TypeError: x\n    at toString (${SELF_URL}:1:1)`;
      const err = { stack: original };
      stripExtensionFramesFromStack(err, null);
      expect(err.stack).toBe(original);
    });

    test("no-op when the stack contains no injected frame", () => {
      const original = "TypeError: x\n    at Object.toString (<anonymous>)\n    at eval:1:1";
      const err = { stack: original };
      stripExtensionFramesFromStack(err, SELF_URL);
      expect(err.stack).toBe(original);
    });

    test("scrubs a cross-realm error (object with string stack, not instanceof Error)", () => {
      // An error thrown in an iframe realm is not `instanceof` the top realm's
      // Error; the duck-typed check must still scrub it.
      const crossRealm = Object.create(null) as { stack: string };
      crossRealm.stack = `TypeError: x\n    at toString (${SELF_URL}:2:2)\n    at page:1:1`;
      stripExtensionFramesFromStack(crossRealm, SELF_URL);
      expect(extensionSchemeRe.test(crossRealm.stack)).toBe(false);
      expect(crossRealm.stack).toContain("at page:1:1");
    });

    test("does not throw on non-object / non-string-stack inputs", () => {
      expect(() => stripExtensionFramesFromStack(null, SELF_URL)).not.toThrow();
      expect(() => stripExtensionFramesFromStack(undefined, SELF_URL)).not.toThrow();
      expect(() => stripExtensionFramesFromStack(42, SELF_URL)).not.toThrow();
      expect(() => stripExtensionFramesFromStack({ stack: 123 }, SELF_URL)).not.toThrow();
    });

    test("does not throw when stack is non-writable (leaves it as-is)", () => {
      const err = {};
      Object.defineProperty(err, "stack", {
        value: `TypeError: x\n    at toString (${SELF_URL}:1:1)`,
        writable: false,
        configurable: false,
      });
      expect(() => stripExtensionFramesFromStack(err, SELF_URL)).not.toThrow();
    });
  });

  describe("delegate-then-scrub reject path", () => {
    const nonFunctions: ReadonlyArray<unknown> = [
      null,
      undefined,
      42,
      "hello",
      true,
      { a: 1 },
      [1, 2, 3],
      Symbol("s"),
    ];

    test("Property: rejecting a non-function throws the same TypeError as native", () => {
      const registry = new Map<AnyFunction, string>();
      const patched = makePatchedToString(registry, nativeToString, nativeCall, SELF_URL);

      fc.assert(
        fc.property(fc.integer({ min: 0, max: nonFunctions.length - 1 }), (idx) => {
          const value = nonFunctions[idx];

          let nativeErr: unknown;
          try {
            nativeToString.call(value as AnyFunction);
          } catch (e) {
            nativeErr = e;
          }

          let patchedErr: unknown;
          try {
            patched.call(value);
          } catch (e) {
            patchedErr = e;
          }

          expect(nativeErr).toBeInstanceOf(TypeError);
          expect(patchedErr).toBeInstanceOf(TypeError);
          expect((patchedErr as TypeError).message).toBe((nativeErr as TypeError).message);
        }),
        { numRuns: 100 }
      );
    });

    test("reject path scrubs injected frames from the thrown error's stack", () => {
      // Force the delegated native toString to throw an error whose stack we
      // control (as if V8 had produced an injected frame), and assert the
      // wrapper scrubs it before rethrow while preserving the native frame.
      const registry = new Map<AnyFunction, string>();
      const fakeError = new TypeError(
        "Function.prototype.toString requires that 'this' be a Function"
      );
      fakeError.stack = [
        "TypeError: Function.prototype.toString requires that 'this' be a Function",
        "    at Object.toString (<anonymous>)",
        `    at toString (${SELF_URL}:1216:44)`,
        "    at https://page.example/x.js:1:1",
      ].join("\n");
      const throwingToString = (() => {
        throw fakeError;
      }) as unknown as typeof Function.prototype.toString;

      const patched = makePatchedToString(registry, throwingToString, nativeCall, SELF_URL);

      let caught: unknown;
      try {
        patched.call({});
      } catch (e) {
        caught = e;
      }

      // Same error object, rethrown (not wrapped).
      expect(caught).toBe(fakeError);
      expect(caught).toBeInstanceOf(TypeError);
      const stack = (caught as TypeError).stack ?? "";
      expect(extensionSchemeRe.test(stack)).toBe(false);
      expect(stack).toContain("at Object.toString (<anonymous>)");
      expect(stack).toContain("at https://page.example/x.js:1:1");
    });
  });

  describe("success paths are unchanged by the try/catch wrapper", () => {
    test("Property: registered overrides return the masked native string", () => {
      const registry = new Map<AnyFunction, string>();
      const patched = makePatchedToString(registry, nativeToString, nativeCall, SELF_URL);

      fc.assert(
        fc.property(identifierArb, (name) => {
          const fn: AnyFunction = (..._a: unknown[]) => undefined;
          registry.set(fn, name);
          expect(patched.call(fn)).toBe(`function ${name}() { [native code] }`);
          registry.delete(fn);
        }),
        { numRuns: 100 }
      );
    });

    test("Property: unregistered functions fall through identically to native toString", () => {
      const registry = new Map<AnyFunction, string>();
      const patched = makePatchedToString(registry, nativeToString, nativeCall, SELF_URL);

      const candidates: ReadonlyArray<AnyFunction> = [
        (..._a: unknown[]) => undefined,
        function named(..._a: unknown[]) {
          return undefined;
        },
        Array.isArray,
        Object.keys,
        Math.max,
      ];

      fc.assert(
        fc.property(fc.integer({ min: 0, max: candidates.length - 1 }), (idx) => {
          const fn = candidates[idx];
          expect(patched.call(fn)).toBe(nativeToString.call(fn));
        }),
        { numRuns: 100 }
      );
    });
  });
});
