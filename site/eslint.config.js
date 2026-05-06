//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"

export default [
  {
    ignores: [".output/**", "node_modules/**"],
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
]
