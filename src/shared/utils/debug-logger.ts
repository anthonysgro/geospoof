/**
 * Shared debug logging utility for all extension contexts.
 * Five severity levels with numeric comparison gating.
 * ERROR and WARN always emit. INFO/DEBUG/TRACE respect verbose mode + verbosity threshold.
 */

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

const hasPerformanceNow =
  typeof performance !== "undefined" && typeof performance.now === "function";

function timestamp(): string {
  const ms = hasPerformanceNow ? performance.now() : Date.now();
  return `${ms}ms`;
}

export function createLogger(component: ComponentTag) {
  return {
    error(...args: unknown[]): void {
      console.error(`[GeoSpoof ${component}] [ERROR] ${timestamp()} —`, ...args);
    },
    warn(...args: unknown[]): void {
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
