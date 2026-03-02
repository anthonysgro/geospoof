import { defineConfig, loadEnv, type Plugin } from "vite";
import { resolve } from "path";
import { cpSync, existsSync } from "fs";

/**
 * Custom Vite plugin to copy static assets (manifest, HTML, CSS, icons)
 * to the dist/ directory after build completes.
 */
function copyStaticAssets(): Plugin {
  return {
    name: "copy-static-assets",
    writeBundle() {
      const assets = [
        { from: "manifest.json", to: "dist/manifest.json" },
        { from: "assets/popup.html", to: "dist/popup/popup.html" },
        { from: "assets/popup.css", to: "dist/popup/popup.css" },
      ];

      for (const asset of assets) {
        const src = resolve(__dirname, asset.from);
        if (existsSync(src)) {
          cpSync(src, resolve(__dirname, asset.to));
        }
      }

      // Copy icons directory recursively
      const iconsSrc = resolve(__dirname, "icons");
      if (existsSync(iconsSrc)) {
        cpSync(iconsSrc, resolve(__dirname, "dist/icons"), { recursive: true });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";

  // Load all env variables (including non-VITE_ prefixed) from .env files
  const env = loadEnv(mode, process.cwd(), "");

  return {
    build: {
      outDir: "dist",
      emptyOutDir: true,
      // Use esbuild for minification (Vite default)
      minify: isDev ? false : "esbuild",
      sourcemap: isDev ? "inline" : false,
      target: "ES2022",
      rollupOptions: {
        input: {
          "background/background": resolve(__dirname, "src/background/index.ts"),
          "content/content": resolve(__dirname, "src/content/index.ts"),
          "content/injected": resolve(__dirname, "src/content/injected.ts"),
          "popup/popup": resolve(__dirname, "src/popup/index.ts"),
        },
        // Tell Rollup these functions are pure (no side effects) so tree-shaking removes them
        treeshake: isDev
          ? true
          : {
              manualPureFunctions: ["console.log", "console.debug", "console.info"],
            },
        output: {
          // Preserve directory structure: background/background.js, content/content.js, etc.
          entryFileNames: "[name].js",
          // No code splitting — each entry must be standalone for extension compatibility
          manualChunks: undefined,
          chunkFileNames: "shared/[name]-[hash].js",
          assetFileNames: "[name].[ext]",
          // Use ES format — Vite bundles everything into single files per entry.
          // No dynamic imports exist, so each output is self-contained.
          format: "es",
          // Prevent code splitting between entries
          inlineDynamicImports: false,
        },
      },
    },

    plugins: [copyStaticAssets()],

    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
        "@/background": resolve(__dirname, "./src/background"),
        "@/content": resolve(__dirname, "./src/content"),
        "@/popup": resolve(__dirname, "./src/popup"),
        "@/shared": resolve(__dirname, "./src/shared"),
      },
    },

    // Environment variable handling: inject process.env.EVENT_NAME as a define
    // so it gets inlined at build time (works for content scripts in page context)
    define: {
      "process.env.EVENT_NAME": JSON.stringify(env.EVENT_NAME || "__geospoof_settings_update"),
      "process.env.NODE_ENV": JSON.stringify(mode),
      "process.env.DEBUG": JSON.stringify(env.DEBUG || "false"),
    },

    // esbuild options for production optimizations
    esbuild: isDev
      ? {}
      : {
          // Remove console.log, console.debug, console.info in production
          // Keep console.error and console.warn
          drop: [],
          pure: ["console.log", "console.debug", "console.info"],
          // Preserve browser API names during minification
          keepNames: true,
        },
  };
});
