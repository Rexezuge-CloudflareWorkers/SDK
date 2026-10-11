import { describe, expect, it } from 'vitest';
import { FixedClock, SystemClock } from './Clock';

// Converged Clock: AWS's `now()` name, Mail-Otter/ChordDHT's mutable FixedClock.
describe('Clock', () => {
  it('SystemClock returns Date.now()', () => {
    // Bracketed rather than equal: two Date.now() reads a millisecond apart
    // are not the same number, and a test that assumes they are fails on
    // nothing but clock granularity.
    const before = Date.now();
    const now = new SystemClock().now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });

  it('FixedClock is settable and advanceable', () => {
    const clock = new FixedClock(1000);
    expect(clock.now()).toBe(1000);
    clock.setNowMs(2500);
    expect(clock.now()).toBe(2500);
    clock.advanceByMs(500);
    expect(clock.now()).toBe(3000);
  });

  it('FixedClock defaults to zero', () => {
    expect(new FixedClock().now()).toBe(0);
  });
});
