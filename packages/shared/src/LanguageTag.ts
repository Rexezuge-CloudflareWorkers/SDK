/**
 * Single canonical language-tag implementation for backend + web.
 *
 * ## Provenance
 *
 * Converged from Durable-DAV-Router's `LanguageTag.ts` and Edge-Git's
 * `LanguageTag.ts`. The two are byte-identical — both were written to replace
 * the older `canonicalizeBackendLocaleTag` (shared) / `canonicalizeTag` (web
 * `i18n.ts`) split, which had drifted. Edge-Sonic has no such file (its web layer
 * uses the shared one directly), so it contributes nothing here beyond confirming
 * the shape.
 *
 * Import from here in both layers. This is generic BCP-47 casing, distinct from
 * `LocaleUtil`'s `canonicalizeLocaleTag`, which additionally titlecases a
 * four-letter script subtag for locale negotiation against a fixed table.
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
 * A BCP-47 language tag, canonicalized: `zh_TW`, `zh-tw`, and `zh-TW` all
 * canonicalize to `zh-TW`.
 */
// eslint-disable-next-line sonarjs/redundant-type-aliases -- the alias is the kit's documented domain type, named across public signatures; inlining it to `string` would erase the constraint the name carries.
type LanguageTag = string;

export { canonicalizeLanguageTag };
export type { LanguageTag };
