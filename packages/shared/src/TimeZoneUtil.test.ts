import { describe, expect, it } from 'vitest';
import { TimeZoneUtil } from './TimeZoneUtil.ts';

// From Mail-Otter's TimeZoneUtil. DST-free instants so the expected values are exact.
describe('TimeZoneUtil', () => {
  it('isValid accepts IANA zones and rejects junk', () => {
    expect(TimeZoneUtil.isValid('America/New_York')).toBe(true);
    expect(TimeZoneUtil.isValid('Asia/Tokyo')).toBe(true);
    expect(TimeZoneUtil.isValid('Not/A_Zone')).toBe(false);
    expect(TimeZoneUtil.isValid(null)).toBe(false);
    expect(TimeZoneUtil.isValid(undefined as unknown as string)).toBe(false);
  });

  it('normalize trims a valid zone and falls back to UTC otherwise', () => {
    expect(TimeZoneUtil.normalize(' America/New_York ')).toBe('America/New_York');
    expect(TimeZoneUtil.normalize('Not/A_Zone')).toBe('UTC');
    expect(TimeZoneUtil.normalize(null)).toBe('UTC');
  });

  it('todayInZone formats the local calendar day', () => {
    const now = new Date('2026-01-15T10:30:00Z');
    expect(TimeZoneUtil.todayInZone('UTC', now)).toBe('2026-01-15');
    // Tokyo is UTC+9, so the same instant is already the next day.
    expect(TimeZoneUtil.todayInZone('Asia/Tokyo', now)).toBe('2026-01-15');
  });

  it('getLocalDayStartUnixSeconds returns UTC midnight for the UTC zone', () => {
    const now = new Date('2026-01-15T10:30:00Z');
    expect(TimeZoneUtil.getLocalDayStartUnixSeconds(now, 'UTC')).toBe(Date.UTC(2026, 0, 15, 0, 0, 0) / 1000);
  });

  it('getLocalDayStartUnixSeconds anchors local midnight in a fixed offset zone', () => {
    // America/New_York is UTC-5 in January (no DST). 12:00Z is 07:00 local, so
    // local midnight of the 15th is 05:00Z on the 15th.
    const now = new Date('2026-01-15T12:00:00Z');
    expect(TimeZoneUtil.getLocalDayStartUnixSeconds(now, 'America/New_York')).toBe(Date.UTC(2026, 0, 15, 5, 0, 0) / 1000);
  });

  it('getLocalDayStartUnixSeconds never returns an instant after now', () => {
    const now = new Date('2026-01-15T12:00:00Z');
    const start = TimeZoneUtil.getLocalDayStartUnixSeconds(now, 'Asia/Tokyo');
    expect(start).toBeLessThanOrEqual(Math.floor(now.getTime() / 1000));
  });
});
