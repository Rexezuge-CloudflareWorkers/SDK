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
export { bytesToBase64, base64ToBytes } from './Base64';

// Time.
export { SystemClock, FixedClock, SYSTEM_CLOCK } from './Clock';
export type { Clock } from './Clock';
export { TimestampUtil } from './TimestampUtil';
export { TimeZoneUtil, DEFAULT_TIME_ZONE } from './TimeZoneUtil';

// Locale.
export { LocaleUtil, DEFAULT_LOCALE, SUPPORTED_LOCALES, LOCALE_DISPLAY_NAMES } from './LocaleUtil';
export type { SupportedLocale } from './LocaleUtil';
export { canonicalizeLanguageTag } from './LanguageTag';
export type { LanguageTag } from './LanguageTag';

// Identity + email.
export { normalizeEmail, isValidEmailFormat, MAX_EMAIL_LENGTH } from './EmailUtil';
export { EMAIL_FORMAT_RE } from './Identity';

// Identifiers.
export { UUIDUtil } from './UUIDUtil';
export { CryptoIdGenerator, FixedIdGenerator } from './IdGenerator';
export type { IdGenerator } from './IdGenerator';

// Crypto + secrets.
export { CryptoUtil } from './CryptoUtil';

// Error handling.
export { ErrorSanitizationUtil } from './ErrorSanitizationUtil';
export { err, getOrThrow, isOk, mapResult, ok } from './Result';
export type { Err, Ok, Result } from './Result';

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
} from './RemoteUrlPolicy';
export type { UrlPolicyOptions } from './RemoteUrlPolicy';

// Pagination.
export { CursorCodec } from './CursorCodec';
export type { Page } from './CursorCodec';

// Cloudflare subrequest accounting.
export { SubrequestCounter, UNMETERED_SUBREQUESTS, SUBREQUEST_KINDS, subrequestSpend, NO_SUBREQUESTS_SPENT } from './SubrequestMeter';
export type { SubrequestMeter, SubrequestKind, SubrequestSpend } from './SubrequestMeter';

// Auth-side memo helper.
export { passwordFingerprint } from './PasswordFingerprint';

// Token hashing.
export { TokenHashUtil } from './TokenHashUtil';
