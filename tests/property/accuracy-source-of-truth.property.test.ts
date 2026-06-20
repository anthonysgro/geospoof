/**
 * Property 9: Single source of truth for the default accuracy.
 *
 * **Validates: Requirements 1.3, 8.3**
 *
 * No production module SHALL contain a literal accuracy fallback other
 * than a reference to `DEFAULT_ACCURACY_M`. This test scans the four
 * modules that historically contained hardcoded accuracy values and
 * asserts no numeric literal `10` (or `20`) remains in a context that
 * looks like an accuracy assignment.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * The four modules that previously contained hardcoded accuracy values.
 * If any of these reintroduce a stray literal, the test fails.
 */
const MODULES_TO_SCAN = [
  "src/background/messages.ts",
  "src/background/settings.ts",
  "src/content/injected/geolocation.ts",
  "src/content/injected/iframe-patching.ts",
];

/**
 * Patterns that indicate a hardcoded accuracy literal rather than
 * `DEFAULT_ACCURACY_M` or a dynamic reference. We look for:
 *   - `accuracy: 10` or `accuracy: 20` (object literal assignment)
 *   - `accuracy ?? 10` or `accuracy ?? 20` (nullish coalescing fallback)
 *   - `: 10` preceded by `accuracy` context in the same expression
 *
 * We intentionally ignore comment lines (starting with `//` or `*`) so
 * documentation and explanatory comments don't trigger false positives.
 */
const ACCURACY_LITERAL_PATTERNS = [
  // accuracy: <number> in an object literal (catches `accuracy: 10`, `accuracy: 20`)
  /accuracy\s*:\s*(?:10|20)\b/,
  // Nullish coalescing / OR fallback (catches `accuracy ?? 10`, `accuracy || 10`)
  /accuracy\s*(?:\?\?|\|\|)\s*(?:10|20)\b/,
  // Ternary fallback (catches `... ? accuracy : 10`)
  /\?\s*accuracy\s*:\s*(?:10|20)\b/,
];

describe("Property 9: Single source of truth for the default accuracy", () => {
  const root = resolve(__dirname, "../..");

  for (const modulePath of MODULES_TO_SCAN) {
    test(`no stray accuracy literal in ${modulePath}`, () => {
      const fullPath = resolve(root, modulePath);
      const source = readFileSync(fullPath, "utf-8");
      const lines = source.split("\n");

      const violations: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trimStart();

        // Skip comment-only lines
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
          continue;
        }

        for (const pattern of ACCURACY_LITERAL_PATTERNS) {
          if (pattern.test(line)) {
            violations.push(`  Line ${i + 1}: ${line.trim()}`);
          }
        }
      }

      if (violations.length > 0) {
        throw new Error(
          `Found hardcoded accuracy literal(s) in ${modulePath}. ` +
            `Use DEFAULT_ACCURACY_M instead:\n${violations.join("\n")}`
        );
      }
    });
  }
});
