/**
 * Identity-string well-formedness (Layer 0).
 *
 * ## Provenance
 *
 * Converged from Durable-DAV-Router's, Edge-Git's and Edge-Sonic's
 * `Identity.ts`. Router and Edge-Sonic are byte-identical and hold exactly one
 * helper — `isValidEmailFormat` — described as "a cheap sanity check on an
 * identity the service did not choose". Edge-Git's is larger: the same predicate
 * plus an `EmailAddress` value object and a `RepoFullName`/`repoDoKey` pair. The
 * value object duplicates `normalizeEmail` (see `EmailUtil.ts`); the
 * `owner/name` repo identifier, `.git`-stripping and Durable-Object key helpers
 * are **git business logic and are left local** — they are the same kind of
 * repo-specific concern as `GitOids`/`BranchValidation`.
 *
 * ## Design decision
 *
 * This file is the definitional home of `isValidEmailFormat` because that is what
 * the wider group (Router, Edge-Sonic, Edge-Git) file under "Identity". Two
 * regexes circulated for the same predicate: Durable-DAV's
 * `/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/` and the Router/Edge-Git/Sonic
 * `/^[^@\s]+@[^\s@][^\s.@]*\.[^\s@]+$/`. Durable-DAV's is the **stricter** one —
 * it rejects a leading dot in the domain (`a@.b.c`) and consecutive dots, which
 * the other admits — so per the kit rule the stricter form is kept. `EmailUtil`
 * re-exports the predicate so the whole email surface is one import.
 *
 * Deliberately permissive about the local part (RFC 5322 allows far more than
 * this) and strict about the obvious mistakes: no whitespace, exactly one `@`,
 * a dot-separated domain, and a bounded total length. It is a shape check, not a
 * deliverability check — the authoritative validation is the identity provider.
 */
const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

const MAX_EMAIL_LENGTH = 254;

function isValidEmailFormat(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed !== '' && trimmed.length <= MAX_EMAIL_LENGTH && EMAIL_FORMAT_RE.test(trimmed);
}

export { isValidEmailFormat, MAX_EMAIL_LENGTH, EMAIL_FORMAT_RE };
