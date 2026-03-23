/**
 * Type declarations for test environment globals.
 *
 * In the test environment, browser API functions are Vitest mocks.
 * This file augments the Function interface to include Vitest Mock
 * properties, allowing test files to call .mockResolvedValue() etc.
 * on browser API functions without type errors.
 *
 * This is scoped to test files only (included via tsconfig.json).
 */
import type { Mock } from "vitest";

// Augment the global Function interface so that every function
// also exposes Vitest mock helpers.  This is intentionally broad
// because test files routinely call mock methods on browser APIs.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Function extends Mock {}
}

export {};
