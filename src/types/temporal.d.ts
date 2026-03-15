/**
 * Minimal Temporal API type declarations for feature-detected usage.
 * The Temporal API is available in modern Firefox but not yet in all runtimes.
 * These types support the overrides in injected.ts.
 */

interface TemporalTimeZoneProtocol {
  id?: string;
  toString(): string;
}

interface TemporalPlainDateTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
  readonly microsecond: number;
  readonly nanosecond: number;
  toString(): string;
}

interface TemporalPlainDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  toString(): string;
}

interface TemporalPlainTime {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
  readonly microsecond: number;
  readonly nanosecond: number;
  toString(): string;
}

interface TemporalZonedDateTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly timeZoneId: string;
  toString(): string;
}

interface TemporalNow {
  timeZoneId(): string;
  plainDateTimeISO(tzLike?: string | TemporalTimeZoneProtocol): TemporalPlainDateTime;
  plainDateISO(tzLike?: string | TemporalTimeZoneProtocol): TemporalPlainDate;
  plainTimeISO(tzLike?: string | TemporalTimeZoneProtocol): TemporalPlainTime;
  zonedDateTimeISO(tzLike?: string | TemporalTimeZoneProtocol): TemporalZonedDateTime;
}

interface TemporalNamespace {
  readonly Now: TemporalNow;
}

// Temporal may or may not exist at runtime (feature-detected)
// eslint-disable-next-line no-var
declare var Temporal: TemporalNamespace | undefined;
