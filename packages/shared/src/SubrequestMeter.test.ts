import { describe, expect, it } from 'vitest';
import { SubrequestCounter, UNMETERED_SUBREQUESTS, subrequestSpend, NO_SUBREQUESTS_SPENT } from './SubrequestMeter.ts';
import type { SubrequestSpend } from './SubrequestMeter.ts';

// Adapted from Edge-Sonic's test/subrequest-budget.test.ts (the "the counter" block).
describe('SubrequestCounter', () => {
  it('counts every kind separately and sums the total', () => {
    const meter = new SubrequestCounter(10);
    meter.charge(3, 'd1');
    meter.charge(1, 'kv');
    meter.charge(2, 'fetch');
    expect(meter.spent).toBe(6);
    expect(meter.breakdown()).toEqual({ d1: 3, kv: 1, fetch: 2, rpc: 0, secret: 0 });
  });

  it('reports what it spent with the total beside it, zeroes included', () => {
    const meter = new SubrequestCounter(10);
    meter.charge(4, 'd1');
    const spend: SubrequestSpend = subrequestSpend(meter.breakdown(), meter.spent);
    expect(spend).toEqual({ total: 4, d1: 4, kv: 0, fetch: 0, rpc: 0, secret: 0 });
    expect(NO_SUBREQUESTS_SPENT.total).toBe(0);
  });

  it('ignores a non-positive charge rather than going backwards', () => {
    const meter = new SubrequestCounter(10);
    meter.charge(0);
    meter.charge(-5);
    expect(meter.spent).toBe(0);
  });

  it('resets the total, the breakdown and the ceiling together', () => {
    const meter = new SubrequestCounter(10);
    meter.charge(6, 'd1');
    meter.charge(2, 'fetch');
    meter.reset();
    expect(meter.spent).toBe(0);
    expect(meter.breakdown()).toEqual({ d1: 0, kv: 0, fetch: 0, rpc: 0, secret: 0 });
    expect(meter.ceiling).toBe(10);
  });

  it('enforces nothing when the ceiling is infinite', () => {
    const meter = new SubrequestCounter(Infinity);
    meter.charge(10_000);
    expect(meter.exhausted).toBe(false);
    expect(meter.canAfford(10_000)).toBe(true);
    expect(Number.isFinite(meter.remaining)).toBe(false);
  });

  it('reports affordability and exhaustion against the effective ceiling', () => {
    const meter = new SubrequestCounter(4);
    expect(meter.canAfford(4)).toBe(true);
    meter.charge(4);
    expect(meter.exhausted).toBe(true);
    expect(meter.remaining).toBe(0);
    expect(meter.canAfford(1)).toBe(false);
  });

  it('setCeiling only narrows, never raises, and is floored at zero', () => {
    const meter = new SubrequestCounter(50);
    meter.setCeiling(6);
    expect(meter.ceiling).toBe(6);
    meter.setCeiling(40);
    expect(meter.ceiling).toBe(6);
    meter.setCeiling(-2);
    expect(meter.ceiling).toBe(0);
  });

  it('setCeiling is a no-op on an unmetered counter', () => {
    const meter = new SubrequestCounter(Infinity);
    meter.setCeiling(6);
    expect(meter.ceiling).toBe(Infinity);
  });

  it('hands out a meter that enforces nothing, for a caller given none', () => {
    UNMETERED_SUBREQUESTS.charge(1_000_000);
    expect(UNMETERED_SUBREQUESTS.exhausted).toBe(false);
    UNMETERED_SUBREQUESTS.charge(-1_000_000);
  });
});
