/**
 * Primary keys.
 *
 * ## Provenance
 *
 * Converged from `UUIDUtil.ts` in Durable-DAV, AWS-AccessBridge, Edge-Git,
 * Mail-Otter (a re-export of the DAV form under the name `UIDUtility`), the
 * Router, CalDAV-Bridge, Mail-Meow and Edge-Sonic. Four carried the bare
 * `getRandomUUID`; Edge-Git and AWS added `getRandomUUIDNoDash`; Edge-Sonic added
 * the derived `deterministicId`. ChordDHT-Tracker has no UUIDUtil (its ids go
 * through `IdGenerator`).
 *
 * ## Design decision
 *
 * The whole requirement for a row whose id never appears on the wire is a v4 UUID
 * in canonical dashed form, so `getRandomUUID` is the base. `getRandomUUIDNoDash`
 * is kept from the AWS/Edge-Git form (two repos independently needed the compact
 * spelling). `deterministicId` is Edge-Sonic's and is the single most valuable
 * member — see its doc comment for why length-prefixing the parts is load-bearing.
 */
class UUIDUtil {
  public static getRandomUUID(): string {
    return crypto.randomUUID();
  }

  /**
   * The canonical form with the dashes removed, for a context that wants a
   * compact, dash-free hex-ish token.
   */
  public static getRandomUUIDNoDash(): string {
    return crypto.randomUUID().replaceAll('-', '');
  }

  /**
   * A UUID-shaped id derived from a namespace and its parts, stable across runs.
   *
   * ### Why this exists
   *
   * **Because "create this" is not idempotent.** A Cloudflare Workflow step is
   * cached by name and may be retried, so an import that mints a fresh id per
   * attempt writes the *same row twice* on every retry — and a user who pressed
   * the button three times finds four copies. `getRandomUUID` is right for the
   * path where each create really is a new row, and wrong for an import, where a
   * retried step is the *same* row.
   *
   * So an imported row's id is a function of `(namespace, ...parts)`: a retry
   * resolves the same id, the write rewrites it, and the outcome does not depend
   * on how many times the step ran.
   *
   * ### SHA-256, and why not MD5
   *
   * MD5 exists in one repo for a token scheme that specifies it, but this is a
   * collision question with a consequence: two different inputs sharing an id
   * means one overwrites the other, and MD5's collision resistance is not
   * something to lean on when `crypto.subtle` is available. 128 bits of SHA-256
   * is used, in canonical dashed form so the value is a UUID by inspection rather
   * than 32 hex characters used as one.
   *
   * ### Every part is **length-prefixed**, because a separator proves nothing
   *
   * The obvious implementation joins the parts with a delimiter, and the obvious
   * claim is that the delimiter cannot appear inside a part. That claim is
   * **false**: joining `[ns, a, b]` and joining `[ns, a\u0000b]` both produce the
   * same string, so a delimiter — *any* delimiter — is forgeable by choosing a
   * part containing it. Two different inputs then hash to one id, and one
   * overwrites the other.
   *
   * So each part contributes its **length** before its bytes: `3:ns1:a1:b`. That
   * encoding is injective, because the length is recoverable from the bytes
   * themselves — there is exactly one way to parse it — so no choice of parts
   * produces the same string.
   */
  public static async deterministicId(namespace: string, ...parts: readonly string[]): Promise<string> {
    const payload = [namespace, ...parts].map((part) => `${part.length}:${part}`).join('');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
    const hex = Array.from(new Uint8Array(digest).slice(0, 16), (byte): string => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
}

export { UUIDUtil };
