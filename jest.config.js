module.exports = {
  testEnvironment: "jsdom",
  testMatch: ["**/tests/**/*.test.js"],
  collectCoverageFrom: ["background/**/*.js", "content/**/*.js", "popup/**/*.js"],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  transform: {},
  testTimeout: 30000,
};
