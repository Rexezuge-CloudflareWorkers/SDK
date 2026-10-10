import type { BackendStrings, SupportedLocale } from './BackendStrings';
import { normalizeLocale } from './BackendStrings';
import { deStrings } from './locales/de';
import { enStrings } from './locales/en';
import { esStrings } from './locales/es';
import { frStrings } from './locales/fr';
import { itStrings } from './locales/it';
import { jaStrings } from './locales/ja';
import { koStrings } from './locales/ko';
import { nlStrings } from './locales/nl';
import { plStrings } from './locales/pl';
import { ptStrings } from './locales/pt';
import { zhCNStrings } from './locales/zh-CN';
import { zhTWStrings } from './locales/zh-TW';

/**
 * The twelve bundles, keyed by locale.
 *
 * Typed as a total `Record` rather than a partial map with a `??` at the read
 * site: adding a locale to `SUPPORTED_LOCALES` without adding a bundle is a
 * compile error here instead of a runtime `undefined` string at the boundary.
 */
const LOCALE_STRINGS: Record<SupportedLocale, BackendStrings> = {
  en: enStrings,
  de: deStrings,
  fr: frStrings,
  es: esStrings,
  it: itStrings,
  nl: nlStrings,
  pt: ptStrings,
  pl: plStrings,
  ja: jaStrings,
  'zh-CN': zhCNStrings,
  'zh-TW': zhTWStrings,
  ko: koStrings,
};

/**
 * Look up the bundle for a language tag.
 *
 * `null`/`undefined`/`""`/unknown all land on `en` through `normalizeLocale`,
 * so a caller cannot get `undefined` back and never has to guard the read.
 * Prefer this over indexing `LOCALE_STRINGS` directly — the index would happily
 * return `undefined` for a tag that has no bundle.
 */
function getLocalizedStrings(locale: string | null | undefined): BackendStrings {
  return LOCALE_STRINGS[normalizeLocale(locale)];
}

/**
 * Look up a bundle, falling back to a second preference before `en`.
 *
 * This is the `Accept-Language` plus stored-user-preference pair: the header is
 * what the *client* sent this request, the stored preference is what the user
 * chose once. The stored preference only speaks when the header does not
 * express a real choice, which is what `primary === 'en'` means — an explicit
 * `en` header and an absent header are indistinguishable to this resolver, and
 * that is deliberate, because a browser that sends `en` while the user picked
 * `ja` should still get `ja`.
 */
function resolveLocalizedStrings(locale?: string | null, fallback?: string | null): BackendStrings {
  const primary = normalizeLocale(locale);
  return getLocalizedStrings(primary === 'en' ? normalizeLocale(fallback) : primary);
}

export { LOCALE_STRINGS, getLocalizedStrings, resolveLocalizedStrings };
