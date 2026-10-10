import { describe, expect, it } from 'vitest';
import { CryptoIdGenerator, FixedIdGenerator } from './IdGenerator';

// From ChordDHT-Tracker's IdGenerator.ts + its sharedUtils.test.ts.
describe('IdGenerator', () => {
  it('CryptoIdGenerator returns a UUID', () => {
    expect(new CryptoIdGenerator().randomUUID()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('FixedIdGenerator replays queued ids then synthesizes', () => {
    const generator = new FixedIdGenerator(['a', '', 'b']);
    expect(generator.randomUUID()).toBe('a');
    expect(generator.randomUUID()).toBe('b');
    expect(generator.randomUUID()).toBe('fixed-uuid-1');
    generator.queueId('c');
    expect(generator.randomUUID()).toBe('c');
    expect(generator.randomUUID()).toBe('fixed-uuid-2');
  });

  it('FixedIdGenerator accepts a single id string', () => {
    const generator = new FixedIdGenerator('only');
    expect(generator.randomUUID()).toBe('only');
    expect(generator.randomUUID()).toBe('fixed-uuid-1');
  });
});
