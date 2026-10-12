/**
 * `@rexezuge/i18n` — the backend string bundle and its twelve locales.
 *
 * Zero runtime dependencies. The bundle is one `common` group of three keys
 * (see `BackendStrings.ts` for the provenance and for why the `repo`/`token`/
 * `git` groups are not here); the locale table, the fallback chain, and the
 * lookup are the parts every consumer boundary needs.
 */
export { SUPPORTED_LOCALES, canonicalizeLanguageTag, normalizeLocale } from './BackendStrings.ts';
export type { BackendStrings, CommonStrings, SupportedLocale } from './BackendStrings.ts';
export { LOCALE_STRINGS, getLocalizedStrings, resolveLocalizedStrings } from './getLocalizedStrings.ts';

// The bundles themselves, exported so a consumer can read one directly (a
// migration script, a test, a bundle-level integrity check) without reaching
// through the table.
export { deStrings } from './locales/de.ts';
export { enStrings } from './locales/en.ts';
export { esStrings } from './locales/es.ts';
export { frStrings } from './locales/fr.ts';
export { itStrings } from './locales/it.ts';
export { jaStrings } from './locales/ja.ts';
export { koStrings } from './locales/ko.ts';
export { nlStrings } from './locales/nl.ts';
export { plStrings } from './locales/pl.ts';
export { ptStrings } from './locales/pt.ts';
export { zhCNStrings } from './locales/zh-CN.ts';
export { zhTWStrings } from './locales/zh-TW.ts';
