# @rexezuge/shared

Pure platform-generic utilities (codecs, time, locale, crypto, `Result`, SSRF policy) for Cloudflare Workers.

Zero dependencies. One concept per file; the barrel only re-exports. Business-specific helpers (money, git oids, calendar sync, credential sharding) deliberately stay in their consumer repos.

```bash
pnpm add @rexezuge/shared
```

---

## 1. What's inside

| Area | Exports |
| --- | --- |
| Byte codecs | `bytesToBase64`, `base64ToBytes` |
| Time | `SystemClock` / `FixedClock` (injectable `Clock`), `TimestampUtil`, `TimeZoneUtil` + `DEFAULT_TIME_ZONE` |
| Locale | `LocaleUtil` (`DEFAULT_LOCALE`, `SUPPORTED_LOCALES`, display names), `canonicalizeLanguageTag` |
| Email | `normalizeEmail`, `isValidEmailFormat`, `MAX_EMAIL_LENGTH` |
| Identifiers | `UUIDUtil`, `CryptoIdGenerator` / `FixedIdGenerator` (injectable `IdGenerator`) |
| Crypto + secrets | `CryptoUtil`, `TokenHashUtil`, `passwordFingerprint` |
| Error handling | `ErrorSanitizationUtil` (operator/client message split), `ok` / `err` / `getOrThrow` / `mapResult` + `Result` |
| Network policy | `normalizeRemoteUrl`, `resolveRedirectUrl`, `parseAllowedHosts`, `isPrivateOrInternalHost` (+ limits and blocklists) |
| Pagination | `CursorCodec` (opaque cursors, `Page`) |
| Subrequest accounting | `SubrequestCounter`, `SUBREQUEST_KINDS`, `subrequestSpend` (Cloudflare's 50-subrequest ceiling) |

## 2. Usage

```ts
import {
  CryptoIdGenerator,
  CursorCodec,
  ErrorSanitizationUtil,
  normalizeEmail,
  normalizeRemoteUrl,
  ok,
  SYSTEM_CLOCK,
} from '@rexezuge/shared';

normalizeEmail('  USER@Example.COM '); // 'user@example.com'
normalizeRemoteUrl('https://example.com/hook', { allowedHosts: parseAllowedHosts('example.com') }); // throws RemoteUrlRejectedError on SSRF targets
CursorCodec.encode({ id: 'abc', createdAt: 123 }); // opaque page cursor
const now = SYSTEM_CLOCK.now(); // inject FixedClock in tests
```

Conventions worth knowing:

- **Clocks and ID generators are injectable.** Production code takes a `Clock` / `IdGenerator`; tests pass `FixedClock` / `FixedIdGenerator` instead of mocking time or randomness.
- **`Result` is for expected failures, exceptions for programmer errors.** `getOrThrow` bridges the two at boundaries.
- **`RemoteUrlPolicy` is fail-closed.** Private/internal hosts, over-long URLs, and excess redirects throw `RemoteUrlRejectedError` rather than fetching.

---

## Verifying this package

```bash
pnpm --filter @rexezuge/shared exec tsc -p tsconfig.json
pnpm --filter @rexezuge/shared typecheck
pnpm --filter @rexezuge/shared test
```
