/**
 * OAuth2 PKCE and state generation.
 *
 * Converged from `oauth2/OAuth2StateUtil.ts` in Mail-Meow and Mail-Otter, which
 * were byte-identical, plus the same four methods inline in CalDAV-Bridge's
 * `oauth2/OAuth2ProviderUtil.ts`.
 *
 * ## Why this is in `shared` and the providers are not
 *
 * These four operations are pure — no `fetch`, no credential, no state — so
 * every rule is testable from the Node suite with no Workers runtime and no
 * double. The provider *transports* (Google's token endpoint, Microsoft Graph,
 * Fastmail JMAP) are business logic and stay in the consumer repos, which is the
 * line `shared`'s header draws: platform-generic helpers in, product-specific
 * protocol clients out.
 *
 * The `state` hash is the security-relevant one: it is what binds a callback to
 * the authorization request that started it, so it is generated here rather than
 * at each call site where three repos had each grown their own.
 */
import { CryptoUtil } from './CryptoUtil.ts';

/**
 * Generate an OAuth2 `state` value.
 *
 * 32 random bytes, base64url. Long enough that guessing one is not a route to a
 * forged callback.
 */
function generateState(): string {
  return CryptoUtil.randomBase64Url(32);
}

/**
 * Generate a PKCE `code_verifier`.
 *
 * RFC 7636 §4.1 asks for 43–128 characters of unreserved alphabet; 64 random
 * bytes is base64url-encoded to 86, comfortably inside the range.
 */
function generateCodeVerifier(): string {
  return CryptoUtil.randomBase64Url(64);
}

/**
 * Hash a `state` for storage.
 *
 * Stored rather than the raw value so a read of the authorization-session table
 * does not hand out a live callback token. Compared with a constant-time compare
 * at the call site — this is the digest, not the comparison.
 */
async function getStateHash(state: string): Promise<string> {
  return CryptoUtil.sha256Hex(state);
}

/**
 * The PKCE `code_challenge` for a verifier: `BASE64URL(SHA-256(verifier))`.
 *
 * The S256 method, not `plain`. `plain` sends the verifier itself, which
 * defeats the point of PKCE for anyone who can see the authorization request.
 */
async function getCodeChallenge(codeVerifier: string): Promise<string> {
  const digest: ArrayBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  return CryptoUtil.toBase64Url(new Uint8Array(digest));
}

export { generateCodeVerifier, generateState, getCodeChallenge, getStateHash };
