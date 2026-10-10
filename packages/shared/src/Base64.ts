/**
 * Base64 codec for byte payloads.
 *
 * ## Provenance
 *
 * Converged from `packages/shared/src/utils/Base64.ts` (Durable-DAV), the
 * documented best form. Four implementations once existed — Durable-DAV's own,
 * `DavReadCache`, and `aes-gcm` running the `String.fromCodePoint(...subarray)`
 * + `btoa` form this file was written to replace. ChordDHT-Tracker and
 * Mail-Otter carry no byte codec of their own; their `CryptoUtil`s use the
 * `btoa`+transform form. This file is the canonical one for **standard**
 * base64. The **base64url** alphabet is a different job and lives in
 * `CryptoUtil` — that duplication is deliberate (different alphabet).
 *
 * ## Why not `String.fromCodePoint` + `btoa`
 *
 * The obvious encoder builds a binary string and `btoa`s it:
 *
 * ```ts
 * let binary = '';
 * for (let i = 0; i < bytes.length; i += 8192) {
 *   binary += String.fromCodePoint(...bytes.subarray(i, i + 8192));
 * }
 * return btoa(binary);
 * ```
 *
 * That allocates roughly 2× the input as UTF-16 — up to 100 MB of garbage for a
 * 50 MB payload, on top of the buffer and the result — and the variadic spread
 * approaches the engine's argument limit. A direct 3-byte-to-4-char table is
 * allocation-light and has no argument limit. `base64ToBytes` keeps the `atob`
 * form: decoding allocates one binary string and one buffer, which is the
 * output's own size rather than double it, and `atob` does the validation for
 * free.
 */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Encode `bytes` as standard base64 (with `=` padding).
 *
 * Not base64url: pre-binary KV file entries stored these as opaque values and
 * `aes-gcm` stores them where `atob` reads them back. `CryptoUtil` has the
 * URL-safe variant for the cases that need one.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  const len = bytes.length;
  const remainder = len % 3;
  const limit = len - remainder;
  for (let i = 0; i < limit; i += 3) {
    const triple = bytes[i] * 65_536 + bytes[i + 1] * 256 + bytes[i + 2];
    out +=
      BASE64_ALPHABET[(triple >> 18) & 63] +
      BASE64_ALPHABET[(triple >> 12) & 63] +
      BASE64_ALPHABET[(triple >> 6) & 63] +
      BASE64_ALPHABET[triple & 63];
  }
  if (remainder === 1) {
    const value = bytes[limit];
    out += `${BASE64_ALPHABET[value >> 2]}${BASE64_ALPHABET[(value << 4) & 63]}==`;
  } else if (remainder === 2) {
    const pair = (bytes[limit] << 8) | bytes[limit + 1];
    out += `${BASE64_ALPHABET[pair >> 10]}${BASE64_ALPHABET[(pair >> 4) & 63]}${BASE64_ALPHABET[(pair << 2) & 63]}=`;
  }
  return out;
}

/**
 * Decode standard base64.
 *
 * `atob` throws on malformed input rather than producing partial bytes, which is
 * the right behaviour for every caller here: a corrupt cache entry or a mistyped
 * key should fail loudly, not decrypt to noise.
 */
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = (binary.codePointAt(i) ?? 0) & 0xff;
  return out;
}

export { bytesToBase64, base64ToBytes };
