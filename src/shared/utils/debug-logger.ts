/**
 * Shared debug logging utility for all extension contexts.
 * Five severity levels with numeric comparison gating.
 * ERROR and WARN always emit. INFO/DEBUG/TRACE respect verbose mode + verbosity threshold.
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

/**
 * TEMPORARY (debugging): optional sink invoked for every emitted log line.
 * Used to relay background-context logs to the page console on platforms
 * where the background inspector is unreliable (Safari iOS). Re-entrancy is
 * guarded so a sink that itself logs can't recurse. Remove with the relay.
 */
type LogSink = (component: ComponentTag, level: LogLevelName, args: unknown[]) => void;
let _sink: LogSink | null = null;
let _inSink = false;

export function setLogSink(sink: LogSink | null): void {
  _sink = sink;
}

function emitToSink(component: ComponentTag, level: LogLevelName, args: unknown[]): void {
  if (_sink === null || _inSink) return;
  _inSink = true;
  try {
    _sink(component, level, args);
  } catch {
    /* never let a logging sink throw into the caller */
  } finally {
    _inSink = false;
  }
}

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
      console.error(`[GeoSpoof ${component}] [ERROR] ${timestamp()} —`, ...args);
      emitToSink(component, "ERROR", args);
    },
    warn(...args: unknown[]): void {
      console.warn(`[GeoSpoof ${component}] [WARN] ${timestamp()} —`, ...args);
      emitToSink(component, "WARN", args);
    },
    info(...args: unknown[]): void {
      if (!_enabled || LogLevel.INFO > _level) return;
      console.info(`[GeoSpoof ${component}] [INFO] ${timestamp()} —`, ...args);
      emitToSink(component, "INFO", args);
    },
    debug(...args: unknown[]): void {
      if (!_enabled || LogLevel.DEBUG > _level) return;
      console.debug(`[GeoSpoof ${component}] [DEBUG] ${timestamp()} —`, ...args);
      emitToSink(component, "DEBUG", args);
    },
    trace(...args: unknown[]): void {
      if (!_enabled || LogLevel.TRACE > _level) return;
      console.debug(`[GeoSpoof ${component}] [TRACE] ${timestamp()} —`, ...args);
      emitToSink(component, "TRACE", args);
    },
    /** @deprecated Use info/debug/trace instead. Alias for `info` during migration. */
    log(...args: unknown[]): void {
      if (!_enabled || LogLevel.INFO > _level) return;
      console.info(`[GeoSpoof ${component}] [INFO] ${timestamp()} —`, ...args);
      emitToSink(component, "INFO", args);
    },
  };
}
