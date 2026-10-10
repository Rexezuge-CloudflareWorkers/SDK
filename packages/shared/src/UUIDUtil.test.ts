import { describe, expect, it } from 'vitest';
import { UUIDUtil } from './UUIDUtil';

// Adapted from Edge-Sonic's deterministicId assertions (import-phases.test.ts).
describe('UUIDUtil', () => {
  it('getRandomUUID produces a canonical dashed v4', () => {
    expect(UUIDUtil.getRandomUUID()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('getRandomUUIDNoDash is the dashed form with the dashes removed', () => {
    const noDash = UUIDUtil.getRandomUUIDNoDash();
    expect(noDash).toMatch(/^[0-9a-f]{32}$/);
    expect(noDash).not.toContain('-');
  });

  it('mints a distinct value per call', () => {
    expect(UUIDUtil.getRandomUUID()).not.toBe(UUIDUtil.getRandomUUID());
  });
});

describe('deterministicId', () => {
  it('is stable across calls and differs per part', async () => {
    const first = await UUIDUtil.deterministicId('ns:import', 'run-1', 'p1');
    const again = await UUIDUtil.deterministicId('ns:import', 'run-1', 'p1');
    const other = await UUIDUtil.deterministicId('ns:import', 'run-1', 'p2');
    expect(again).toBe(first);
    expect(other).not.toBe(first);
    // Canonical dashed form — a UUID by inspection, not 32 hex used as one.
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('cannot be made to collide by embedding a separator inside a part', async () => {
    // Length-prefixing is load-bearing: joining [a, b] vs [a\NUL b] must differ.
    const joined = await UUIDUtil.deterministicId('ns', 'a', 'b');
    const smuggled = await UUIDUtil.deterministicId('ns', 'a\0b');
    expect(smuggled).not.toBe(joined);
  });

  it('is namespace-scoped: a different namespace changes the id', async () => {
    const a = await UUIDUtil.deterministicId('ns1', 'x');
    const b = await UUIDUtil.deterministicId('ns2', 'x');
    expect(a).not.toBe(b);
  });
});
