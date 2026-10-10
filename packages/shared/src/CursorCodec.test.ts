import { describe, expect, it } from 'vitest';
import { CursorCodec } from './CursorCodec';
import type { Page } from './CursorCodec';

// Adapted from ChordDHT's Cursor tests + Edge-Git's decodeOrThrow/isValidCursor.
describe('CursorCodec', () => {
  it('encodes and decodes a payload', () => {
    const cursor = CursorCodec.encode({ offset: 200, region: 'iad' });
    expect(CursorCodec.decode<{ offset: number; region: string }>(cursor)).toEqual({ offset: 200, region: 'iad' });
  });

  it('decodes missing cursors to undefined', () => {
    expect(CursorCodec.decode(undefined)).toBeUndefined();
    expect(CursorCodec.decode(null)).toBeUndefined();
    expect(CursorCodec.decode('')).toBeUndefined();
  });

  it('decodes malformed cursors to undefined rather than throwing', () => {
    expect(CursorCodec.decode('!!!not-base64!!!')).toBeUndefined();
    // Valid base64 that is not JSON.
    expect(CursorCodec.decode(btoa('not json'))).toBeUndefined();
  });

  it('pages with and without a next cursor', () => {
    expect(CursorCodec.page([1, 2])).toEqual({ items: [1, 2] });
    expect(CursorCodec.page([1, 2], 'abc')).toEqual({ items: [1, 2], nextCursor: 'abc' });
  });

  it('round-trips a single round-trip cursor through a Page', () => {
    const next = CursorCodec.encode({ after: 'k1', dir: 1 });
    const page: Page<number> = CursorCodec.page([1, 2, 3], next);
    expect(CursorCodec.decode<{ after: string; dir: number }>(page.nextCursor)).toEqual({ after: 'k1', dir: 1 });
  });
});

describe('CursorCodec.decodeOrThrow', () => {
  it('returns the payload for a valid cursor', () => {
    const cursor = CursorCodec.encode({ after: 'k1' });
    expect(CursorCodec.decodeOrThrow<{ after: string }>(cursor)).toEqual({ after: 'k1' });
  });

  it('undefined for a missing cursor', () => {
    expect(CursorCodec.decodeOrThrow(undefined)).toBeUndefined();
  });

  it('throws a plain Error on a malformed cursor (a higher layer maps it to BadRequest)', () => {
    expect(() => CursorCodec.decodeOrThrow('!!!not-base64!!!')).toThrow('Invalid cursor');
  });
});

describe('CursorCodec.isValidCursor', () => {
  it('treats a missing cursor as valid, and rejects malformed input', () => {
    expect(CursorCodec.isValidCursor(undefined)).toBe(true);
    expect(CursorCodec.isValidCursor('')).toBe(true);
    expect(CursorCodec.isValidCursor(CursorCodec.encode({ after: 'k1' }))).toBe(true);
    expect(CursorCodec.isValidCursor('!!!not-base64!!!')).toBe(false);
  });
});
