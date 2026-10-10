import { CryptoUtil } from './CryptoUtil';

/**
 * The one-place hash for API / personal access tokens.
 *
 * ## Provenance
 *
 * Taken from AWS-AccessBridge's `TokenHashUtil.ts` — the only repo that factored
 * token hashing behind a named helper (as opposed to calling `CryptoUtil.sha256Hex`
 * inline, as Edge-Git does).
 *
 * A PAT is ~244 random bits from two UUIDs, so a plain SHA-256 hex digest is the
 * right storage form: the input is not dictionary-searchable, so no salt or
 * password KDF is needed, and the digest is indexable. Binding the digest for
 * storage means a D1 read or backup no longer carries a live credential.
 *
 * ## Design decisions
 *
 * - `sha256Hex` **delegates to `CryptoUtil.sha256Hex`** rather than reimplementing
 *   the digest loop. AWS carried its own copy only because its `CryptoUtil` did
 *   not yet exist to delegate to; the kit's does, and a second SHA-256
 *   implementation is exactly the drift this package removes.
 * - **No timing-safe compare is shipped.** The brief says to keep an
 *   HMAC/TimingSafe helper "if present"; none of the source repos carries one —
 *   token verification compares two SHA-256 *hex strings*, and nothing in the
 *   repos does it in constant time. Rather than invent a security primitive here
 *   that has no provenance, the helper is left out; a verifier that must compare a
 *   presented token's digest against a stored one does the byte-wise, length-
 *   independent compare itself (a `crypto.subtle`-backed constant-time compare
 *   belongs with the caller's chosen error mapping).
 */
class TokenHashUtil {
  public static async sha256Hex(token: string): Promise<string> {
    return CryptoUtil.sha256Hex(token);
  }
}

export { TokenHashUtil };
