/**
 * `@rexezuge/shared` — the converged, platform-generic utilities distilled from
 * the nine Rexezuge Cloudflare Worker monorepos. One concept per file; this barrel
 * only re-exports. Business-specific helpers (money, git oids, calendar sync,
 * credential sharding, …) are deliberately left in their consumer repos.
 *
 * `isValidEmailFormat` / `MAX_EMAIL_LENGTH` are defined in `Identity.ts` and
 * re-exported by `EmailUtil.ts`; the barrel sources each name **once** (from
 * `EmailUtil`, the one-stop email surface) so an `export *` merge cannot silently
 * drop them to ambiguity.
 */

// Byte codecs.
export { bytesToBase64, base64ToBytes } from './Base64.ts';

// Time.
export { SystemClock, FixedClock, SYSTEM_CLOCK } from './Clock.ts';
export type { Clock } from './Clock.ts';
export { TimestampUtil } from './TimestampUtil.ts';
export { TimeZoneUtil, DEFAULT_TIME_ZONE } from './TimeZoneUtil.ts';

// Locale.
export { LocaleUtil, DEFAULT_LOCALE, SUPPORTED_LOCALES, LOCALE_DISPLAY_NAMES } from './LocaleUtil.ts';
export type { SupportedLocale } from './LocaleUtil.ts';
export { canonicalizeLanguageTag } from './LanguageTag.ts';
export type { LanguageTag } from './LanguageTag.ts';

// Identity + email.
export { normalizeEmail, isValidEmailFormat, MAX_EMAIL_LENGTH } from './EmailUtil.ts';
export { EMAIL_FORMAT_RE } from './Identity.ts';

// Identifiers.
export { UUIDUtil } from './UUIDUtil.ts';
export { CryptoIdGenerator, FixedIdGenerator } from './IdGenerator.ts';
export type { IdGenerator } from './IdGenerator.ts';

// Crypto + secrets.
export { CryptoUtil } from './CryptoUtil.ts';

// Error handling.
export { ErrorSanitizationUtil } from './ErrorSanitizationUtil.ts';
export { err, getOrThrow, isOk, mapResult, ok } from './Result.ts';
export type { Err, Ok, Result } from './Result.ts';

// Network policy.
export {
  normalizeRemoteUrl,
  resolveRedirectUrl,
  parseAllowedHosts,
  isPrivateOrInternalHost,
  stripBrackets,
  stripTrailingDot,
  RemoteUrlRejectedError,
  MAX_REMOTE_URL_LENGTH,
  MAX_REDIRECTS,
  BLOCKED_HOST_SUFFIXES,
  BLOCKED_HOSTNAMES,
} from './RemoteUrlPolicy.ts';
export type { UrlPolicyOptions } from './RemoteUrlPolicy.ts';

// Pagination.
export { CursorCodec } from './CursorCodec.ts';
export type { Page } from './CursorCodec.ts';

// Cloudflare subrequest accounting.
export { SubrequestCounter, UNMETERED_SUBREQUESTS, SUBREQUEST_KINDS, subrequestSpend, NO_SUBREQUESTS_SPENT } from './SubrequestMeter.ts';
export type { SubrequestMeter, SubrequestKind, SubrequestSpend } from './SubrequestMeter.ts';

// Auth-side memo helper.
export { passwordFingerprint } from './PasswordFingerprint.ts';

// Token hashing.
export { TokenHashUtil } from './TokenHashUtil.ts';

// OAuth2 PKCE and state.
export { generateCodeVerifier, generateState, getCodeChallenge, getStateHash } from './OAuth2Pkce.ts';
