/**
 * `@rexezuge/i18n` — the backend string bundle and its twelve locales.
 *
 * Zero runtime dependencies. The bundle is one `common` group of three keys
 * (see `BackendStrings.ts` for the provenance and for why the `repo`/`token`/
 * `git` groups are not here); the locale table, the fallback chain, and the
 * lookup are the parts every consumer boundary needs.
 */
export { SUPPORTED_LOCALES, canonicalizeLanguageTag, normalizeLocale } from './BackendStrings';
export type { BackendStrings, CommonStrings, SupportedLocale } from './BackendStrings';
export { LOCALE_STRINGS, getLocalizedStrings, resolveLocalizedStrings } from './getLocalizedStrings';

// The bundles themselves, exported so a consumer can read one directly (a
// migration script, a test, a bundle-level integrity check) without reaching
// through the table.
export { deStrings } from './locales/de';
export { enStrings } from './locales/en';
export { esStrings } from './locales/es';
export { frStrings } from './locales/fr';
export { itStrings } from './locales/it';
export { jaStrings } from './locales/ja';
export { koStrings } from './locales/ko';
export { nlStrings } from './locales/nl';
export { plStrings } from './locales/pl';
export { ptStrings } from './locales/pt';
export { zhCNStrings } from './locales/zh-CN';
export { zhTWStrings } from './locales/zh-TW';
