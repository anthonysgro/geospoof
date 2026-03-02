const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const Dotenv = require("dotenv-webpack");

const isDevelopment = process.env.NODE_ENV === "development";

module.exports = {
  mode: isDevelopment ? "development" : "production",
  devtool: isDevelopment ? "inline-source-map" : false,

  entry: {
    "background/background": "./background/background.js",
    "content/content": "./content/content.js",
    "content/injected": "./content/injected.js",
    "popup/popup": "./popup/popup.js",
  },

  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    clean: true,
  },

  optimization: {
    minimize: !isDevelopment,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: !isDevelopment, // Remove console.* in production
            drop_debugger: true,
            pure_funcs: isDevelopment ? [] : ["console.log", "console.debug", "console.info"],
          },
          mangle: {
            // Don't mangle browser API names
            reserved: ["browser", "chrome", "navigator", "window", "document"],
          },
          format: {
            comments: false,
          },
        },
        extractComments: false,
      }),
    ],
  },

  plugins: [
    // Load environment variables
    new Dotenv({
      path: "./.env",
      safe: false,
      systemvars: true,
      silent: true,
      defaults: false,
    }),

    // Copy static files
    new CopyPlugin({
      patterns: [
        { from: "manifest.json", to: "manifest.json" },
        { from: "icons", to: "icons" },
        { from: "popup/popup.html", to: "popup/popup.html" },
        { from: "popup/popup.css", to: "popup/popup.css" },
      ],
    }),
  ],

  resolve: {
    extensions: [".js"],
  },
};
