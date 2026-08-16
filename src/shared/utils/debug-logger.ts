/**
 * Shared debug logging utility for all extension contexts.
 * Five severity levels with numeric comparison gating.
 *
 * INFO/DEBUG/TRACE always respect the debug toggle (`_enabled`) + verbosity
 * threshold (`_level`) in every context.
 *
 * ERROR/WARN behavior depends on context:
 *   - `BG` (background), `POPUP`, and `CS` (content script, isolated world) are
 *     NOT observable by page JavaScript, so error/warn always emit there —
 *     useful for diagnosing production issues at no privacy cost.
 *   - `INJ` (injected) runs in the page's MAIN world, where `console.*` is the
 *     page's own console object (observable and hookable by the page). A
 *     branded `[GeoSpoof …]` line there is a fingerprinting/detection vector, so
 *     `INJ` gates ALL five levels — including error/warn — behind the same
 *     `_enabled` + `_level` check as the others. A normal user (debug off)
 *     emits nothing to the page console; bug reporters flip on debug logging.
 */

import { now } from "./safe-time";

type ComponentTag = "BG" | "CS" | "INJ" | "POPUP";

export const LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4,
} as const;

export type LogLevelName = keyof typeof LogLevel;
export type LogLevelValue = (typeof LogLevel)[LogLevelName];

let _enabled = false;
let _level: LogLevelValue = LogLevel.INFO;

const validLevels = new Set<string>(Object.keys(LogLevel));

export function setDebugEnabled(enabled: boolean): void {
  _enabled = enabled;
}

export function isDebugEnabled(): boolean {
  return _enabled;
}

export function setVerbosityLevel(level: string): void {
  if (validLevels.has(level)) {
    _level = LogLevel[level as LogLevelName];
  } else {
    _level = LogLevel.INFO;
  }
}

export function getVerbosityLevel(): LogLevelName {
  for (const [name, value] of Object.entries(LogLevel)) {
    if (value === _level) return name as LogLevelName;
  }
  return "INFO";
}

function timestamp(): string {
  const ms = now();
  return `${ms}ms`;
}

export function createLogger(component: ComponentTag) {
  return {
    error(...args: unknown[]): void {
      // INJ shares the page's realm — gate it behind the toggle + level like
      // every other INJ level so no branded output reaches the page console.
      // Other contexts aren't page-observable, so error always emits there.
      if (component === "INJ" && (!_enabled || LogLevel.ERROR > _level)) return;
      console.error(`[GeoSpoof ${component}] [ERROR] ${timestamp()} —`, ...args);
    },
    warn(...args: unknown[]): void {
      if (component === "INJ" && (!_enabled || LogLevel.WARN > _level)) return;
      console.warn(`[GeoSpoof ${component}] [WARN] ${timestamp()} —`, ...args);
    },
    info(...args: unknown[]): void {
      if (!_enabled || LogLevel.INFO > _level) return;
      console.info(`[GeoSpoof ${component}] [INFO] ${timestamp()} —`, ...args);
    },
    debug(...args: unknown[]): void {
      if (!_enabled || LogLevel.DEBUG > _level) return;
      console.debug(`[GeoSpoof ${component}] [DEBUG] ${timestamp()} —`, ...args);
    },
    trace(...args: unknown[]): void {
      if (!_enabled || LogLevel.TRACE > _level) return;
      console.debug(`[GeoSpoof ${component}] [TRACE] ${timestamp()} —`, ...args);
    },
    /** @deprecated Use info/debug/trace instead. Alias for `info` during migration. */
    log(...args: unknown[]): void {
      if (!_enabled || LogLevel.INFO > _level) return;
      console.info(`[GeoSpoof ${component}] [INFO] ${timestamp()} —`, ...args);
    },
  };
}
