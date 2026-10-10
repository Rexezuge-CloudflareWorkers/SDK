import { SYSTEM_CLOCK, type Clock } from './Clock';

/**
 * Unix timestamps, in seconds and milliseconds.
 *
 * ## Provenance
 *
 * Converged from all nine `TimestampUtil.ts` copies. They fall into three
 * shapes: Durable-DAV's minimal two-method set (`getCurrentUnixTimestampInSeconds`
 * + `addDays`) with a deliberate "seconds everywhere" argument; AWS's compact set
 * plus an **injectable `Clock`** on the current-time readers; and the full
 * ChordDHT/Mail-Otter set (`…InMilliseconds`, `addMinutes`, `addHours`,
 * `subtractMinutes`, `subtractDays`, `convertIso…`) reading `Date.now()` directly.
 *
 * ## Design decisions
 *
 * - The **full method set** is kept: the union of the three shapes loses nothing
 *   and each method exists because at least two repos independently reached for
 *   it.
 * - The current-time reads go through an **injectable `Clock`** defaulting to
 *   `SYSTEM_CLOCK` (AWS's shape). Reading the clock through one seam lets a test
 *   pin "now" without racing `Date.now()`, and a caller cannot accidentally store
 *   milliseconds in a column compared against seconds.
 * - Seconds is the storage unit (Durable-DAV's argument): where millisecond
 *   precision is genuinely wanted — ordering within a single pass — reach for
 *   `…InMilliseconds` (or `clock.now()`) explicitly, so the unit is visible at the
 *   call site. `add*`/`subtract*` operate on the **second** unit and are pure
 *   calendar arithmetic, never `Date` arithmetic, so they cannot pick up a
 *   timezone or a DST transition.
 */
class TimestampUtil {
  /**
   * Now, in whole milliseconds.
   *
   * @param clock Inject a `FixedClock` to pin "now" in a test; production leaves
   * it defaulted.
   */
  public static getCurrentUnixTimestampInMilliseconds(clock: Clock = SYSTEM_CLOCK): number {
    return clock.now();
  }

  /**
   * Now, in whole seconds. The default storage unit.
   *
   * @param clock Inject a `FixedClock` to pin "now" in a test; production leaves
   * it defaulted.
   */
  public static getCurrentUnixTimestampInSeconds(clock: Clock = SYSTEM_CLOCK): number {
    return Math.floor(clock.now() / 1000);
  }

  public static addMinutes(timestamp: number, minutes: number): number {
    return timestamp + minutes * 60;
  }

  public static addHours(timestamp: number, hours: number): number {
    return timestamp + hours * 60 * 60;
  }

  public static addDays(timestamp: number, days: number): number {
    return timestamp + days * 60 * 60 * 24;
  }

  public static subtractMinutes(timestamp: number, minutes: number): number {
    return timestamp - minutes * 60;
  }

  public static subtractDays(timestamp: number, days: number): number {
    return timestamp - days * 60 * 60 * 24;
  }

  public static convertIsoToUnixTimestampInSeconds(isoString: string): number {
    return Math.floor(new Date(isoString).getTime() / 1000);
  }
}

export { TimestampUtil };
