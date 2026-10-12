/**
 * The key/type source of truth for every localized backend string.
 *
 * ## Provenance
 *
 * Distilled from `packages/shared/src/i18n/BackendStrings.ts` across the
 * consumer repos, comparing them one by one:
 *
 * - **Durable-DAV** — the canonical base. Its `AGENTS.md` pins backend strings
 *   to `packages/shared/src/i18n`, and it is the copy that *deliberately*
 *   shrunk: the `repo`/`token`/`issue`/`git`/`namespace` groups, 15 keys across
 *   12 locales (~60 translated strings), were deleted because no production
 *   code path ever read them and `validate_locales.mjs` failed CI on a missing
 *   translation of a key nothing could emit.
 * - **Durable-DAV-Router** — same twelve locales, same `common` group, same
 *   fallback chain, plus a `resolveLocalizedStrings(locale, fallback)` chain
 *   and a `formatBackendString` interpolator (its own data is gone, so that
 *   interpolator is residue here too).
 * - **Edge-Git** — same twelve locales and same three `common` strings, but it
 *   still carries the five groups Durable-DAV deleted, and its bundle is
 *   therefore the only one with `{placeholder}` values.
 * - **Mail-Otter** — same twelve locales, an entirely different product
 *   bundle (digest/actionPage/summary/chat/tracking/notify/results/csv). No
 *   overlap with the `common` group at all.
 * - **Edge-Sonic** — partial: an English-only single-file bundle with one
 *   flattened `common` group of eight keys. Noted, not ported.
 *
 * Durable-DAV's set wins, so `common` with three keys is the canonical
 * bundle: three repos ship those three strings identically, a fourth ships
 * them plus five unreachable groups, and the fifth ships something else
 * entirely.
 *
 * ## Self-contained
 *
 * The source repos import `canonicalizeLanguageTag` from
 * `shared/utils/LanguageTag`. This package has zero runtime dependencies, so
 * that one function is inlined below rather than re-exported from a sibling
 * kit package — the tag grammar is small, fixed, and testable here.
 */

/**
Every locale the bundle ships. `en` is the fallback and is never empty.
*/
const SUPPORTED_LOCALES = ['en', 'de', 'fr', 'es', 'it', 'nl', 'pt', 'pl', 'ja', 'zh-CN', 'zh-TW', 'ko'] as const;

/**
A locale tag that has a bundle. Anything else resolves through `normalizeLocale`.
*/
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Messages a request path can actually emit.
 *
 * The group exists because a route boundary maps a `ServiceError` onto a status
 * and, for the 401/403/500 pair, onto a client-facing sentence. Nothing here is
 * interpolated: a message is either static or comes from the error itself, so a
 * `{placeholder}` would be printed to a client verbatim.
 */
interface CommonStrings {
  unauthorized: string;
  forbidden: string;
  internalError: string;
}

interface BackendStrings {
  common: CommonStrings;
}

/**
 * Fold a raw language tag to its canonical form.
 *
 * `_` separators are macOS-style and must not create a distinct tag; the
 * language subtag is lowercase and any two-letter region is uppercase, which
 * is what makes `zh_cn`, `ZH-CN` and `zh-CN` the *same* tag before any bundle
 * lookup happens. A tag that is only separators is `en`, not an empty string.
 */
function canonicalizeLanguageTag(tag: string): string {
  const normalized = tag.trim().replaceAll('_', '-');
  const parts = normalized.split('-').filter(Boolean);
  if (parts.length === 0) return 'en';
  const language = (parts[0] ?? 'en').toLowerCase();
  if (parts.length === 1) return language;
  const rest = parts.slice(1).map((part) => (part.length === 2 ? part.toUpperCase() : part.toLowerCase()));
  return [language, ...rest].join('-');
}

/**
 * Resolve any tag — or nothing at all — to a locale that has a bundle.
 *
 * The fallback rules, in order:
 *
 * 1. Nothing, or not a string, is `en`. A missing `Accept-Language` and a
 *    corrupt one must not diverge.
 * 2. An exact canonical hit wins, so `zh-CN` stays distinct from `zh-TW`.
 * 3. `zh` — and any other `zh-*` region — collapses to `zh-CN`. It is the
 *    default Simplified bundle, which is what `zh` means to a client that
 *    sends the bare language subtag.
 * 4. A base-language match maps a regional variant onto its language bundle:
 *    `de-AT` is `de`, `pt-BR` is `pt`. A wrong-but-close locale is worse than
 *    an honest fallback, but an unrelated one (`xx`) is not mapped at all.
 */
function normalizeLocale(locale: string | null | undefined): SupportedLocale {
  if (!locale || typeof locale !== 'string') return 'en';
  const canonical = canonicalizeLanguageTag(locale);
  if ((SUPPORTED_LOCALES as readonly string[]).includes(canonical)) {
    return canonical as SupportedLocale;
  }
  const base = canonical.split('-', 1)[0]?.toLowerCase() ?? 'en';
  if (base === 'zh') return 'zh-CN';
  const match = (SUPPORTED_LOCALES as readonly string[]).find((l) => l.toLowerCase() === base);
  return (match || 'en') as SupportedLocale;
}

export { SUPPORTED_LOCALES, canonicalizeLanguageTag, normalizeLocale };
export type { BackendStrings, CommonStrings, SupportedLocale };
