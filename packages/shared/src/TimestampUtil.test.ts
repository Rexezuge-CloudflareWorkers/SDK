import { describe, expect, it } from 'vitest';
import { TimestampUtil } from './TimestampUtil';
import { FixedClock, SystemClock } from './Clock';

// Converged TimestampUtil: full method set with an injectable Clock seam.
describe('TimestampUtil', () => {
  it('reads the current time in milliseconds and seconds', () => {
    const before = Date.now();
    expect(TimestampUtil.getCurrentUnixTimestampInMilliseconds()).toBeGreaterThanOrEqual(before);
    expect(TimestampUtil.getCurrentUnixTimestampInSeconds()).toBe(Math.floor(Date.now() / 1000));
  });

  it('honors an injected clock for both readers', () => {
    const clock = new FixedClock(10_000);
    expect(TimestampUtil.getCurrentUnixTimestampInMilliseconds(clock)).toBe(10_000);
    expect(TimestampUtil.getCurrentUnixTimestampInSeconds(clock)).toBe(10);
  });

  it('derives seconds from the injected clock, not the wall clock', () => {
    const clock = new FixedClock(1_999);
    expect(TimestampUtil.getCurrentUnixTimestampInSeconds(clock)).toBe(1);
    clock.advanceByMs(1);
    expect(TimestampUtil.getCurrentUnixTimestampInSeconds(clock)).toBe(2);
  });

  it('adds and subtracts on the second unit', () => {
    expect(TimestampUtil.addMinutes(1000, 2)).toBe(1120);
    expect(TimestampUtil.addHours(1000, 2)).toBe(8200);
    expect(TimestampUtil.addDays(1000, 2)).toBe(1000 + 172_800);
    expect(TimestampUtil.subtractMinutes(1000, 2)).toBe(880);
    expect(TimestampUtil.subtractDays(1000, 2)).toBe(1000 - 172_800);
  });

  it('converts an ISO string to unix seconds', () => {
    expect(TimestampUtil.convertIsoToUnixTimestampInSeconds('2026-09-14T12:00:00.000Z')).toBe(
      Math.floor(new Date('2026-09-14T12:00:00.000Z').getTime() / 1000),
    );
  });
});

describe('SystemClock', () => {
  it('tracks Date.now()', () => {
    expect(new SystemClock().now()).toBe(Date.now());
  });
});
