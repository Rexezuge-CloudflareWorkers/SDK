import { describe, expect, it } from 'vitest';
import { err, getOrThrow, isOk, mapResult, ok } from './Result';
import type { Result } from './Result';

// From Edge-Git / ChordDHT-Tracker's Result.ts (byte-identical).
describe('Result', () => {
  it('ok/isOk/mapResult/getOrThrow round-trip success', () => {
    const result: Result<number> = ok(21);
    expect(isOk(result)).toBe(true);
    expect(mapResult(result, (value) => value * 2)).toEqual(ok(42));
    expect(getOrThrow(mapResult(result, (value) => value * 2))).toBe(42);
  });

  it('err/isOk/getOrThrow surface failure', () => {
    const failure = new Error('boom');
    const result = err(failure);
    expect(isOk(result)).toBe(false);
    expect(mapResult(result, (value: never) => value)).toBe(result);
    expect(() => getOrThrow(result)).toThrow('boom');
  });
});
