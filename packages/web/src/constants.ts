/**
 * Timing and path constants the SPA primitives share.
 *
 * ## Provenance
 *
 * `lib/constants.ts` in **CalDAV-Bridge**, **Durable-DAV**, **Durable-DAV-Router**,
 * **Edge-Git**, **Edge-Sonic**, **Mail-Meow**, **Mail-Otter** and
 * **AWS-AccessBridge** — eight copies, of which only three values are shared by
 * most:
 *
 * | Value                            | Repos |
 * | --------------------------------- | ----- |
 * | `NOTICE_TIMEOUT_MS = 6000`        | 7 of 8 (all but AWS-AccessBridge, which has no notice bar) |
 * | `ZERO_TRUST_AUTHENTICATION_PATH`  | 7 of 8 (all but CalDAV-Bridge) |
 * | `COPY_FEEDBACK_TIMEOUT_MS = 1500` | 5 of 8 |
 *
 * Everything else stayed in exactly one repo and is therefore *not* here — a
 * constant with a single consumer is that consumer's vocabulary, not the
 * family's. Consumers re-declaring these locally should delete them and import
 * from `@rexezuge/web`:
 *
 * - `SCAN_POLL_INTERVAL_MS` (Edge-Sonic) — a library-scan poll cadence.
 * - `FORM_HIGHLIGHT_TIMEOUT_MS` (Mail-Otter) — form highlight animation.
 * - `OAUTH2_FEATURES` / `OAUTH2_FEATURE_SCOPES` (Mail-Otter) — provider tables.
 * - `DEFAULT_TEAM_ID` (AWS-AccessBridge) — re-exported from its own `shared`.
 */

/**
 * How long a notice stays on screen before it dismisses itself.
 *
 * Six seconds in every repo that has one: long enough to read a sentence, short
 * enough that a stale error is not still on screen after the user has fixed it.
 */
const NOTICE_TIMEOUT_MS = 6000;

/**
 * How long a "Copied" affordance stays visible after a clipboard write.
 */
const COPY_FEEDBACK_TIMEOUT_MS = 1500;

/**
 * The path that is always behind Cloudflare Access.
 *
 * Navigating here starts the Zero Trust login flow for a caller with no valid
 * session; after login, Access redirects back to the URL it interrupted, which
 * is why each app also registers this path — Edge-Sonic answers it with a
 * redirect to `/` so a returning signer-in does not land on a JSON
 * `Exception{NotFound}` from what they were told was the app home.
 */
const ZERO_TRUST_AUTHENTICATION_PATH = '/user/';

export { COPY_FEEDBACK_TIMEOUT_MS, NOTICE_TIMEOUT_MS, ZERO_TRUST_AUTHENTICATION_PATH };
