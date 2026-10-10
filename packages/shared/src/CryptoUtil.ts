import { bytesToBase64 } from './Base64';

/**
 * Hashing and key generation.
 *
 * ## Provenance
 *
 * Converged from `CryptoUtil.ts` in Durable-DAV, Edge-Git, Mail-Meow,
 * Mail-Otter, ChordDHT-Tracker and CalDAV-Bridge. Every copy carries
 * `sha256Hex` and `randomBase64Url`; Edge-Git/Mail-Meow/Mail-Otter/ChordDHT add
 * `hmacSha256Hex`; Mail-Meow adds the string overload `base64UrlEncode`;
 * Durable-DAV uniquely factors the digest over raw bytes (`sha256HexOfBytes`) and
 * rewrites base64url on the shared codec.
 *
 * ## Design decisions
 *
 * - The base64url alphabet is a **different alphabet for a different job** from
 *   `Base64.ts`, so the URL-safe transform stays here — but it delegates to the
 *   documented best encoder rather than re-spreading bytes (`String.fromCodePoint`
 *   + `btoa`), which was four copies of the ~2×-UTF-16 form `Base64.ts` replaced.
 * - `sha256Hex` is defined over `sha256HexOfBytes` (Durable-DAV's shape): the
 *   digest then covers exactly the bytes presented, which matters when two sides
 *   compare a digest — an intermediate encoding is a place for them to disagree.
 * - `hmacSha256Hex` is kept from the four repos that carry it.
 *
 * ## Left local
 *
 * ChordDHT-Tracker's `sha1Hex` is deliberately **not** here. SHA-1 is the Chord
 * ring identifier hash (protocol compatibility), not a general security digest;
 * surfacing it in the shared surface would invite exactly the misuse the
 * `sonarjs/hashing` lint it carries a disable for is there to catch. A repo that
 * needs a protocol-mandated SHA-1 computes it on a `BufferSource` itself.
 */
class CryptoUtil {
  /**
   * SHA-256 of a string, hex-encoded.
   *
   * Encoded as UTF-8 first. For bytes you already hold, prefer `sha256HexOfBytes`
   * — this overload is the reason a byte payload used to be laundered through
   * `String.fromCodePoint` into a binary string and back, allocating roughly 2×
   * the input as UTF-16 on the way.
   */
  public static async sha256Hex(value: string): Promise<string> {
    return this.sha256HexOfBytes(new TextEncoder().encode(value));
  }

  /**
   * SHA-256 of raw bytes, hex-encoded.
   *
   * The hash covers exactly these bytes. This matters where the digest is
   * compared between two sides: any intermediate encoding is a place for the two
   * to disagree for a reason that has nothing to do with the content.
   */
  public static async sha256HexOfBytes(bytes: Uint8Array): Promise<string> {
    const digest: ArrayBuffer = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
    return this.toHex(new Uint8Array(digest));
  }

  /**
   * HMAC-SHA256 of `value` under `secret`, hex-encoded.
   *
   * A keyed MAC for a message a caller will recompute on the other side. The key
   * is imported as non-extractable; a comparison against a re-derived MAC must be
   * timing-safe on the caller's side — this helper returns the hex string, it does
   * not compare.
   */
  public static async hmacSha256Hex(value: string, secret: string): Promise<string> {
    const key: CryptoKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature: ArrayBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
    return this.toHex(new Uint8Array(signature));
  }

  private static toHex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte: number): string => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * URL-safe base64 of `bytes` (no `+`, `/` or `=`).
   *
   * Delegates to the shared codec rather than rebuilding the binary string here:
   * the URL-safe transform is applied to the standard alphabet because
   * `Uint8Array#toBase64` is not guaranteed across Workers runtimes.
   */
  public static toBase64Url(bytes: Uint8Array): string {
    return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/={0,2}$/, '');
  }

  /**
   * URL-safe base64 of a UTF-8 string.
   *
   * The same transform as {@link toBase64Url}, for callers holding text rather
   * than bytes. This and `toBase64Url` used to be separate implementations in
   * different packages; they are the same encoding and must not drift.
   */
  public static base64UrlEncode(value: string): string {
    return this.toBase64Url(new TextEncoder().encode(value));
  }

  public static randomBase64Url(byteLength: number): string {
    return this.toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
  }
}

export { CryptoUtil };
