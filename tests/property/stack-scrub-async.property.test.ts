/**
 * Property + unit tests for the async (promise-rejection) arm of the stack scrub.
 * Feature: constructor-stack-leak-fix
 *
 * `stripConstruct` wraps method overrides and scrubs our injected frames from
 * anything they throw. Promise-returning WebIDL ops (permissions.query,
 * RTCPeerConnection.getStats, serviceWorker.register) don't THROW on a foreign
 * `this` — they REJECT, and a synchronous try/catch never sees that. The fix
 * teaches the wrapper to also scrub the rejection of any thenable the override
 * returns, closing the async twin of the leak for every method routed through
 * `stripConstruct` — present and future.
 *
 * As with the sibling suites, the wrapper is reimplemented here with an
 * injectable self-URL (the real one closes over a module const captured from a
 * live extension stack, which jsdom can't reproduce).
 */

"use strict";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => any;

const SELF_URL = "chrome-extension://ediefpejhdgbgabmohddjhjochnjggmc/content/injected.js";
const extensionSchemeRe = /(?:chrome-extension|moz-extension|safari-web-extension):\/\//i;

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
    /* non-configurable stack */
  }
}

/**
 * Faithful reimplementation of the enhanced `stripConstruct` wrapper: scrub
 * synchronous throws AND the rejection of any thenable the override returns.
 */
function wrap(
  fn: AnyFunction,
  selfUrl: string | null
): (this: unknown, ...args: unknown[]) => unknown {
  return function wrapped(this: unknown, ...args: unknown[]): unknown {
    try {
      const result: unknown = fn.apply(this, args);
      if (result != null && typeof (result as { then?: unknown }).then === "function") {
        return (result as Promise<unknown>).then(undefined, (err: unknown) => {
          stripExtensionFramesFromStack(err, selfUrl);
          throw err;
        });
      }
      return result;
    } catch (err) {
      stripExtensionFramesFromStack(err, selfUrl);
      throw err;
    }
  };
}

/** Build an error whose stack carries a native frame, an injected frame, and a page frame. */
function makeLeakyError(message: string): Error {
  const err = new TypeError(message);
  err.stack = [
    `TypeError: ${message}`,
    "    at Object.register (<anonymous>)",
    `    at register (${SELF_URL}:1173:24)`,
    "    at https://page.example/app.js:1:1",
  ].join("\n");
  return err;
}

describe("async stack scrub — Feature: constructor-stack-leak-fix", () => {
  test("rejection is scrubbed: the returned promise rejects with no extension frame", async () => {
    const leaky = makeLeakyError("Illegal invocation");
    const wrapped = wrap(() => Promise.reject(leaky), SELF_URL);

    await expect(wrapped()).rejects.toBe(leaky);
    // The same error object is rejected, but its stack has been scrubbed in place.
    expect(extensionSchemeRe.test(leaky.stack ?? "")).toBe(false);
    // Native + page frames survive.
    expect(leaky.stack).toContain("at Object.register (<anonymous>)");
    expect(leaky.stack).toContain("at https://page.example/app.js:1:1");
  });

  test("synchronous throw is still scrubbed", () => {
    const leaky = makeLeakyError("boom");
    const wrapped = wrap(() => {
      throw leaky;
    }, SELF_URL);

    expect(() => wrapped()).toThrow(leaky);
    expect(extensionSchemeRe.test(leaky.stack ?? "")).toBe(false);
  });

  test("resolved promises pass through unchanged (no behavior change)", async () => {
    const wrapped = wrap((x: number) => Promise.resolve(x * 2), SELF_URL);
    await expect(wrapped(21)).resolves.toBe(42);
  });

  test("non-thenable return values pass through unchanged", () => {
    const wrapped = wrap((x: number) => x + 1, SELF_URL);
    expect(wrapped(1)).toBe(2);
  });

  test("no-op when self-URL is unknown (null) — rejection still surfaces unchanged", async () => {
    const leaky = makeLeakyError("no self url");
    const original = leaky.stack;
    const wrapped = wrap(() => Promise.reject(leaky), null);

    await expect(wrapped()).rejects.toBe(leaky);
    // Nothing to scrub against → stack untouched (still contains the frame).
    expect(leaky.stack).toBe(original);
  });
});

/**
 * The page-callback delivery vector is fixed by DETACHED DELIVERY, not by
 * catch-then-rethrow: we schedule the page callback as the direct task/microtask
 * entry (bound to its argument), so a throwing callback reports only the page's
 * own frames in BOTH `Error.stack` and `ErrorEvent.filename`. Catch-then-rethrow
 * was rejected because rethrowing moves `ErrorEvent.filename` onto our injected
 * line — trading a stack leak for a filename leak. This models that a bound
 * callback carries no reference to the binder on invocation.
 */
describe("detached delivery — Feature: constructor-stack-leak-fix", () => {
  test("a bound callback invoked as a bare task entry throws from its own body only", () => {
    // We can't observe ErrorEvent.filename in jsdom, but we can confirm the
    // binder is not on the stack when the bound callback runs: the bound
    // function's own throw stack starts at the callback, not at the caller that
    // created the binding. (The end-to-end proof lives in the browser detection
    // test `callback-stack-leak`, which checks both stack and filename.)
    function makeAndBind(): () => void {
      const cb = (): never => {
        throw new Error("callback body");
      };
      return cb.bind(undefined);
    }
    const bound = makeAndBind();
    let err: Error | undefined;
    try {
      bound();
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeInstanceOf(Error);
    // `makeAndBind` returned before `bound` ran, so it must not be on the stack.
    expect(err?.stack ?? "").not.toContain("makeAndBind");
  });
});
