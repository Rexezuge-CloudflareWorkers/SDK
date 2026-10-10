import { describe, expect, it } from 'vitest';
import { CryptoUtil } from './CryptoUtil';
import { bytesToBase64, base64ToBytes } from './Base64';

// Adapted from Durable-DAV's test/shared-crypto.test.ts plus the hmac/base64url
// cases from ChordDHT's sharedUtils.test.ts.
const hexOf = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

describe('CryptoUtil.sha256Hex', () => {
  it('matches the well-known empty-string digest', async () => {
    await expect(CryptoUtil.sha256Hex('')).resolves.toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('is deterministic', async () => {
    await expect(CryptoUtil.sha256Hex('abc')).resolves.toBe(await CryptoUtil.sha256Hex('abc'));
  });
});

describe('CryptoUtil.sha256HexOfBytes', () => {
  it('agrees with the string overload for UTF-8 representable text', async () => {
    const text = 'replication';
    await expect(CryptoUtil.sha256HexOfBytes(new TextEncoder().encode(text))).resolves.toBe(await CryptoUtil.sha256Hex(text));
  });

  it('distinguishes byte sequences a lossy text round-trip would merge', async () => {
    // 0xE2 0x9C 0x93 (a checkmark) and 0xEF 0xBF 0xBD (replacement char) decode to
    // one UTF-8 char each but are different files.
    const first = await CryptoUtil.sha256HexOfBytes(new Uint8Array([0xe2, 0x9c, 0x93]));
    const second = await CryptoUtil.sha256HexOfBytes(new Uint8Array([0xef, 0xbf, 0xbd]));
    expect(first).not.toBe(second);
    expect(hexOf(new Uint8Array([0xe2, 0x9c, 0x93]))).not.toBe(hexOf(new Uint8Array([0xef, 0xbf, 0xbd])));
  });

  it('hashes a large buffer without an argument limit', async () => {
    const large = new Uint8Array(512 * 1024).fill(0x61);
    await expect(CryptoUtil.sha256HexOfBytes(large)).resolves.toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('CryptoUtil.hmacSha256Hex', () => {
  it('is deterministic and key-dependent', async () => {
    const a = await CryptoUtil.hmacSha256Hex('message', 'secret');
    const b = await CryptoUtil.hmacSha256Hex('message', 'secret');
    const c = await CryptoUtil.hmacSha256Hex('message', 'secret2');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
    expect(a).not.toBe(c);
  });
});

describe('CryptoUtil base64url', () => {
  it('toBase64Url produces no +, / or = and known vectors', () => {
    expect(CryptoUtil.toBase64Url(new Uint8Array([104, 105]))).toBe('aGk');
    for (let length = 1; length <= 12; length += 1) {
      const value = CryptoUtil.randomBase64Url(length);
      expect(value).toMatch(/^[\w-]+$/i);
    }
  });

  it('base64UrlEncode encodes a UTF-8 string through the same alphabet', () => {
    expect(CryptoUtil.base64UrlEncode('hi')).toBe('aGk');
    expect(CryptoUtil.base64UrlEncode('subjects?_** <>')).not.toMatch(/[+/=]/);
  });

  it('randomBase64Url decodes to the requested number of bytes', () => {
    const value = CryptoUtil.randomBase64Url(32);
    expect(base64ToBytes(value.replaceAll('-', '+').replaceAll('_', '/')).byteLength).toBe(32);
    // Standard round-trip still holds on the + alphabet too.
    const bytes = new Uint8Array([0xfb, 0xff, 0xbe, 0x00, 0x10, 0x83]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });
});
