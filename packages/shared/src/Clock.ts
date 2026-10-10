/**
 * Inject-able time source.
 *
 * ## Provenance
 *
 * Converged from AWS-AccessBridge's `Clock.ts`, Mail-Otter's `Clock.ts` and
 * ChordDHT-Tracker's `Clock.ts`. The three differ in surface, not concept: AWS
 * names the seam `Clock` with `now(): number` and a shared `SYSTEM_CLOCK`;
 * Mail-Otter/ChordDHT name it `IClock` with `nowMs()` and a mutable
 * `FixedClock` carrying `setNowMs`/`advanceByMs`.
 *
 * ## Design decision
 *
 * The kit drops the `I` prefix on the interface (no `any`, no Hungarian drift;
 * the consumer repos' own "no `I` on interfaces" cleanups point the same way),
 * keeps AWS's single-method `now()` as the primary read, and keeps Mail-Otter's
 * mutable `FixedClock` helpers — they cost nothing and are exactly what a test
 * wants. `TimestampUtil`'s current-time reads go through `SYSTEM_CLOCK` by
 * default; pass a `FixedClock` to pin them.
 */

interface Clock {
  /**
   * Milliseconds since the Unix epoch.
   */
  now(): number;
}

/**
 * The production clock. A single shared instance — it holds no state, so there
 * is nothing to gain from more than one, and a default parameter needs a value.
 */
class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

/**
 * A clock seeded at `initialNowMs` and moved forward with `setNowMs`/`advanceByMs`.
 *
 * Two shapes were merged: AWS's `FixedClock` was immutable (constructed with the
 * instant under test), Mail-Otter's was mutable. The mutable form is a superset
 * and is what the time-dependent tests in every repo actually reach for, so a
 * test either pins the instant up front or advances it as work happens.
 */
class FixedClock implements Clock {
  private currentMs: number;

  constructor(initialNowMs = 0) {
    this.currentMs = initialNowMs;
  }

  now(): number {
    return this.currentMs;
  }

  setNowMs(valueMs: number): void {
    this.currentMs = valueMs;
  }

  advanceByMs(deltaMs: number): void {
    this.currentMs += deltaMs;
  }
}

/**
 * The shared production instance, for the common case where a caller wants "now"
 * without choosing a clock. Stateless, so one instance is enough.
 */
const SYSTEM_CLOCK: Clock = new SystemClock();

export type { Clock };
export { SystemClock, FixedClock, SYSTEM_CLOCK };
