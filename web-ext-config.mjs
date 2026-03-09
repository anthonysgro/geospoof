export default {
  sourceDir: "dist",
  artifactsDir: "web-ext-artifacts",
  ignoreFiles: [".DS_Store", "icons/README.md"],
  build: {
    overwriteDest: true,
  },
  run: {
    startUrl: ["https://browserleaks.com/geo"],
  },
  lint: {
    warningsAsErrors: false,
  },
};
