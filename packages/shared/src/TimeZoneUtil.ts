/**
 * Time-zone validation and wall-clock helpers.
 *
 * ## Provenance
 *
 * Taken from Mail-Otter's `TimeZoneUtil.ts` (the only repo that factored the
 * zone-local day start behind a helper). It is well-documented and IANA-correct;
 * no other repo carries a competing copy, so it is kept with one fix.
 *
 * ## Design decision
 *
 * Mail-Otter's `normalize` used `this.isValid(timeZone) ? (timeZone as string).trim() : …`,
 * a type-cast to paper over the fact that `isValid` returns `boolean` and so
 * does not narrow `string | null | undefined`. The kit bans that pattern (no
 * non-null assertions, no `as`-laundering), so the runtime check is a module-level
 * **type guard** and `normalize` runs on the narrowed value. Same behaviour, no
 * cast.
 *
 * `getLocalDayStartUnixSeconds` keeps the two-pass DST handling and the warning
 * not to build it with `new Date('YYYY-MM-DDT00:00:00')` — a zone-less date-time
 * string parses in the runtime's zone, which is always UTC in Workers, silently
 * ignoring `timeZone` entirely.
 */
const DEFAULT_TIME_ZONE = 'UTC';

const WALL_CLOCK_FORMAT: Intl.DateTimeFormatOptions = {
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
};

/**
 * A run-time check that narrows to `string`, so callers do not have to cast.
 *
 * `new Intl.DateTimeFormat` throws a `RangeError` on an unknown zone; the guard
 * catches it and answers `false` for `null`/`undefined`/non-strings in one place.
 */
function isTimeZoneString(value: string | null | undefined): value is string {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  // Trim-then-validate, so `normalize`'s `.trim()` is load-bearing: Mail-Otter's
  // guard validated the *untrimmed* string, so a whitespace-padded IANA zone
  // threw in `Intl` and silently fell back to UTC. A padded zone is a typo, not an
  // unknown zone, so it is trimmed and accepted rather than defaulted.
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

class TimeZoneUtil {
  public static isValid(timeZone: string | null | undefined): boolean {
    return isTimeZoneString(timeZone);
  }

  public static normalize(timeZone: string | null | undefined): string {
    return isTimeZoneString(timeZone) ? timeZone.trim() : DEFAULT_TIME_ZONE;
  }

  public static todayInZone(timeZone: string | null | undefined, now: Date = new Date()): string {
    const zone: string = this.normalize(timeZone);
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  }

  /**
   * Unix seconds of local midnight for the calendar day containing `now`.
   *
   * Two passes are needed because the zone offset depends on the instant: read
   * the wall clock in the target zone, treat that as UTC to derive the offset,
   * then re-anchor local midnight with the offset. The offset is sampled at
   * `now` rather than at the target midnight, which is exact except within a
   * few hours of a DST transition — irrelevant for a 24-hour window.
   *
   * Do NOT build this with `new Date('YYYY-MM-DDT00:00:00')`. A date-time
   * string with no zone designator parses in the *runtime's* zone, and the
   * Workers runtime is always UTC, which silently ignores `timeZone` entirely.
   *
   * An unknown zone falls back to UTC rather than throwing.
   */
  public static getLocalDayStartUnixSeconds(now: Date, timeZone: string | null | undefined): number {
    const zone: string = this.normalize(timeZone);
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, ...WALL_CLOCK_FORMAT }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '0';
    const year = Number(part('year'));
    const month = Number(part('month'));
    const day = Number(part('day'));
    // Some ICU builds report midnight as hour 24 under `hour12: false`.
    const hour = Number(part('hour')) % 24;
    const minute = Number(part('minute'));
    const second = Number(part('second'));
    const wallClockAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const zoneOffsetMs = wallClockAsUtcMs - now.getTime();
    return Math.floor((Date.UTC(year, month - 1, day, 0, 0, 0) - zoneOffsetMs) / 1000);
  }
}

export { TimeZoneUtil, DEFAULT_TIME_ZONE };
