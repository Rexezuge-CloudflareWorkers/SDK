import { describe, expect, it } from 'vitest';
import { bytesToBase64, base64ToBytes } from './Base64';

// Adapted from Durable-DAV's test/shared-base64.test.ts — the proven vectors for
// the 3-byte-to-4-char table codec this file documents as "best".
describe('base64 codec', () => {
  const vectors: ReadonlyArray<readonly [string, string]> = [
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg=='],
    ['fooba', 'Zm9vYmE='],
    ['foobar', 'Zm9vYmFy'],
  ];

  for (const [plain, encoded] of vectors) {
    it(`encodes ${JSON.stringify(plain)}`, () => {
      expect(bytesToBase64(new TextEncoder().encode(plain))).toBe(encoded);
    });
  }

  it('round-trips arbitrary bytes at every length modulo 3', () => {
    for (let length = 0; length < 200; length += 1) {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) bytes[i] = (i * 37 + length) % 256;
      const round = base64ToBytes(bytesToBase64(bytes));
      expect(Array.from(round), `length ${length}`).toEqual(Array.from(bytes));
    }
  });

  it('handles the full byte range including 0x00 and 0xff', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) bytes[i] = i;
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it('agrees with the platform encoder past the old chunk boundary and the spread argument limit', () => {
    // The whole point of the table codec: `String.fromCodePoint(...subarray)` was
    // chunked at 8192 purely to dodge the engine's argument limit, and still
    // allocated ~2× as UTF-16. This asserts agreement at a size that form breaks.
    const bytes = new Uint8Array(32_000);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 97 + 13) % 256;
    const viaTable = bytesToBase64(bytes);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCodePoint(...bytes.subarray(i, i + 8192));
    }
    expect(viaTable).toBe(btoa(binary));
    expect(Array.from(base64ToBytes(viaTable))).toEqual(Array.from(bytes));
  });

  it('round-trips a random payload larger than one chunk', () => {
    const bytes = new Uint8Array(20_000);
    crypto.getRandomValues(bytes);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it('rejects malformed input loudly rather than producing partial bytes', () => {
    expect(() => base64ToBytes('!!!not-base64!!!')).toThrow();
  });
});
