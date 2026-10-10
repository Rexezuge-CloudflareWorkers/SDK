import { isValidEmailFormat, MAX_EMAIL_LENGTH } from './Identity';

/**
 * Email address value helpers.
 *
 * ## Provenance
 *
 * Converged from Durable-DAV's `EmailUtil.ts` (a shape check) and Mail-Meow's
 * `EmailUtil.ts` (address normalization). Durable-DAV's predicate `isValidEmailFormat`
 * canonically lives in `Identity.ts` — the wider group's home, and the stricter
 * of the two regexes found (see the merge note there) — and is re-exported here
 * so `EmailUtil` is the one-stop surface for validation + normalization.
 *
 * `normalizeEmail` comes from Mail-Meow, whose header records why a single
 * normalization rule is a correctness concern, not a cosmetic one: "This function
 * used to exist four times, and the copies disagreed." One copy trimmed and
 * lowercased, the others lowercased only, so `"  Alice@Example.com "` and
 * `"alice@example.com"` were the same account to one layer and different accounts
 * to another — a different account key on each side of a boundary, and a stored
 * registry row that its own service could not resolve.
 *
 * ## Design decision
 *
 * The kit keeps `normalizeEmail` and re-exports the validator; it does not
 * re-introduce Edge-Git's `EmailAddress` value class, which is sugar over the
 * same trim+lowercase and would be a second spelling of the same rule.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export { normalizeEmail, isValidEmailFormat, MAX_EMAIL_LENGTH };
