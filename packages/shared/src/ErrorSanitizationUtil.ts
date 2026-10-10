/**
 * Secret-safe error/log sanitization (Layer 0).
 *
 * ## Provenance
 *
 * Converged from `ErrorSanitizationUtil.ts` in Durable-DAV, Durable-DAV-Router,
 * Edge-Git, Edge-Sonic, Mail-Meow and Mail-Otter. All six redact the same secret
 * shapes (Bearer/Basic headers, token and secret key=value pairs, query-string
 * tokens, JWTs, Google OAuth tokens) and differ only in which extras they add:
 *
 * - Durable-DAV, Edge-Git, Durable-DAV-Router and Edge-Sonic also redact a
 *   repo-specific personal-access-token scheme (`<repo>-pat:<token>`), sanitize
 *   the **stack** as well as the message, and expose `stackForLog`.
 * - Mail-Meow and Mail-Otter omit all three and return `name: <redacted message>`
 *   without a stack.
 *
 * ## Design decisions
 *
 * - **Stack sanitization is kept.** A stack trace repeats the error message and
 *   can name the very secret the message carries, so redacting the message but
 *   logging the raw stack — which Mail-Meow/Mail-Otter effectively do — is a
 *   one-line leak. This is the stricter of the two shapes, so it is the one kept.
 *   `stackForLog` stays for the structured-log payload path.
 * - **The PAT scheme is generalized, not dropped and not repo-hardcoded.** Four
 *   repos each added their own `durable-dav-pat:` / `edge-git-pat:` /
 *   `durable-dav-router-pat:` / `edge-sonic-pat:` literal. Hard-coding those
 *   prefixes here would leak five repo identities into a shared package; dropping
 *   the class would undo a safeguard four of six repos independently judged
 *   necessary. The converged form is one generic `<word>-pat:<token>` pattern
 *   that covers every repo's scheme without naming any.
 * - **Two correctness lessons from Mail-Otter's header are preserved in code and
 *   comment.** `\bbearer`/`\bbasic` keep the leading word boundary — without it
 *   the pattern parsed as "word boundary, then the literal `earer`", matched
 *   nothing, and Authorization headers leaked verbatim while the suite stayed
 *   green only because a Google token in the sample was caught elsewhere. And the
 *   `SECRET_KV` set takes Mail-Meow's superset (`client_id`, bare `code`) over the
 *   narrower alternatives.
 */

const BEARER_PATTERN = /\bbearer\s+\S+/gi;
const BASIC_PATTERN = /\bbasic\s+\S+/gi;
// Any repo's personal-access-token scheme: `<something>-pat:<token>`. Generic on
// purpose — see the header — so no specific repo's prefix is baked in.
const PAT_PATTERN = /\b[\w-]+-pat:[\w-]+/gi;
const TOKEN_KV_PATTERN = /((?:access|refresh|id)[_-]?token\s*[:=]\s*).\S*/gi;
const SECRET_KV_PATTERN = /((?:client[_-]?secret|client[_-]?id|auth[_-]?code|code[_-]?verifier|\bcode)\s*[:=]\s*).\S*/gi;
const TOKEN_QUERY_PATTERN = /([?&](?:access_token|refresh_token|code|client_secret)=).[^&\s;}]*/gi;
const JWT_PATTERN = /eyJ[\w-].+[\w-].+[\w./+=~-]/g;
const GOOGLE_TOKEN_PATTERN = /ya29..[\w.-]+/g;

class ErrorSanitizationUtil {
  /**
   * Redact every recognizable secret shape from a single string.
   *
   * Replacements are inline string literals (not variables or templates) so a
   * `unicorn/no-unsafe-string-replacement`-style rule is satisfied and so CodeQL
   * models each `.replaceAll(regex, literal)` as a `js/clear-text-logging` masking
   * barrier. Order matters only in that the PAT scheme runs first; the rest are
   * disjoint.
   */
  public static sanitizeMessage(message: string): string {
    return message
      .replaceAll(PAT_PATTERN, '[REDACTED-PAT]')
      .replaceAll(BEARER_PATTERN, 'Bearer [REDACTED]')
      .replaceAll(BASIC_PATTERN, 'Basic [REDACTED]')
      .replaceAll(TOKEN_KV_PATTERN, '$1[REDACTED]')
      .replaceAll(SECRET_KV_PATTERN, '$1[REDACTED]')
      .replaceAll(TOKEN_QUERY_PATTERN, '$1[REDACTED]')
      .replaceAll(JWT_PATTERN, '[REDACTED-JWT]')
      .replaceAll(GOOGLE_TOKEN_PATTERN, '[REDACTED]');
  }

  /**
   * A redacted `name: message` (and stack) for a plain log line.
   *
   * Both the message and the stack are sanitized — see the header for why the
   * stack must be.
   */
  public static sanitizeErrorForLogging(error: unknown): string {
    if (error instanceof Error) {
      const redacted = this.sanitizeMessage(error.message);
      const stack = error.stack ? `\n${this.sanitizeMessage(error.stack)}` : '';
      return `${error.name}: ${redacted}${stack}`;
    }
    return this.sanitizeMessage(String(error));
  }

  /**
   * A redacted error, for a structured log payload.
   *
   * `error instanceof Error ? (error.stack ?? error.message) : error` was written
   * out at many call sites, and every one of them bypassed the redaction above —
   * so an error whose message carried a credential would be logged in the clear. A
   * logging helper that only redacts when the caller remembers to call it is not a
   * redaction boundary; this is the single point every payload goes through.
   */
  public static stackForLog(error: unknown): unknown {
    return this.sanitizeErrorForLogging(error);
  }
}

export { ErrorSanitizationUtil };
