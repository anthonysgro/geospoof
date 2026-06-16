//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"

export default [
  {
    ignores: [".output/**", "node_modules/**", "public/**", ".content-collections/**"],
  },
  ...tanstackConfig,
  // Disable rules that don't apply or have missing plugins
  {
    rules: {
      "react-hooks/exhaustive-deps": "off",
    },
  },
  // Relax rules for shadcn-generated UI components
  {
    files: ["src/components/ui/**"],
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "off",
      "no-shadow": "off",
    },
  },
  // Relax rules for test-suite probes: these tests intentionally guard
  // against browser APIs whose types claim to be non-nullable but which
  // may be absent, mutated, or overridden at runtime (that's the whole
  // point of the detection tests). The `expected` / `observe` callbacks
  // used by `buildBehavioralTest` are typed as async-returning so tests
  // can `await` when needed — for purely synchronous comparisons they
  // legitimately have no `await`, so `require-await` is off too.
  {
    files: ["src/lib/test-suite/tests/**"],
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
  // The identity provider and the verification route both defend against
  // partial browser environments (missing navigator fields, stripped Intl
  // surfaces, absent Permissions API, etc.) where static types overstate
  // nullability. The runtime guards are intentional, not redundant.
  {
    files: [
      "src/lib/verification/identity-context.tsx",
      "src/routes/verify.tsx",
    ],
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "off",
    },
  },
]
