import { describe, expect, it } from 'vitest';
import {
  LOCALE_STRINGS,
  SUPPORTED_LOCALES,
  canonicalizeLanguageTag,
  getLocalizedStrings,
  normalizeLocale,
  resolveLocalizedStrings,
} from './index';
import type { BackendStrings } from './BackendStrings';

/**
 * The bundle-integrity checks the consumer repos run as
 * `scripts/validate_locales.mjs` (spawned from their `test/i18n.test.ts`)
 * against JSON bundles, ported here to the TypeScript bundle and run inline.
 *
 * The script answers four questions of every bundle but `en`: does it carry
 * exactly the keys `en` carries (no missing, no extra), are all values
 * non-empty strings, do the `{placeholder}` sets match, and does the bundle set
 * match the supported-locale list. All four are structural, none need a
 * browser, and all four are the ones that drift when a key is added to one
 * locale and not the rest — which is precisely how the five groups deleted in
 * Durable-DAV survived as long as they did.
 */
type Leaf = [path: string, value: unknown];

/** Flatten a bundle to dotted leaf paths, so `common.unauthorized` is one key. */
function flatten(node: Record<string, unknown>, prefix = ''): Leaf[] {
  const out: Leaf[] = [];
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out.push(...flatten(value as Record<string, unknown>, path));
    } else {
      out.push([path, value]);
    }
  }
  return out;
}

/** Placeholders a value interpolates, sorted — the parity unit of the script. */
function placeholdersOf(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return [...new Set(value.match(/\{\w+\}/g) ?? [])].sort();
}

/** Leaves of one bundle. `BackendStrings` is narrow, so walk it as a record. */
function leavesOf(bundle: BackendStrings): Leaf[] {
  return flatten(bundle as unknown as Record<string, unknown>);
}

const enLeaves: Leaf[] = leavesOf(LOCALE_STRINGS.en);
const enKeys: string[] = enLeaves.map(([path]) => path);
const enSet = new Set(enKeys);
const enByKey = new Map(enLeaves);

describe('locale key parity with en', () => {
  it('has a non-empty base bundle to compare against', () => {
    expect(enKeys.length).toBeGreaterThan(0);
    expect(enByKey.get('common.unauthorized')).toBe('Authentication Required.');
  });

  it('ships exactly the locales the supported list names, and no others', () => {
    // Both directions: a listed-but-unshipped locale is a hole in the table,
    // and a shipped-but-unlisted one is a locale nobody asked for.
    expect(SUPPORTED_LOCALES).toEqual(['en', 'de', 'fr', 'es', 'it', 'nl', 'pt', 'pl', 'ja', 'zh-CN', 'zh-TW', 'ko']);
    expect(Object.keys(LOCALE_STRINGS)).toEqual([...SUPPORTED_LOCALES]);
  });

  it('gives every locale exactly the en key set, all the way down', () => {
    // The bundle is one nested `common` group today. `flatten` recurses so that
    // adding a group cannot be shipped to some locales and not others without
    // this failing — the exact failure mode that let the deleted groups rot.
    for (const locale of SUPPORTED_LOCALES) {
      const keys = leavesOf(LOCALE_STRINGS[locale]).map(([path]) => path);
      const missing = enKeys.filter((key) => !keys.includes(key));
      const extra = keys.filter((key) => !enSet.has(key));
      expect({ locale, missing }).toEqual({ locale, missing: [] });
      expect({ locale, extra }).toEqual({ locale, extra: [] });
    }
  });

  it('keeps the same key order as en in every locale', () => {
    // Warn-only in `validate_locales.mjs` — it keeps diffs reviewable. Here it
    // is free to assert, and a locale bundle reordered against `en` is a
    // hand-edited one.
    for (const locale of SUPPORTED_LOCALES) {
      expect({ locale, keys: leavesOf(LOCALE_STRINGS[locale]).map(([path]) => path) }).toEqual({
        locale,
        keys: enKeys,
      });
    }
  });

  it('has no empty value anywhere in the bundle', () => {
    // The script checks this for every locale but `en`; `en` is checked here
    // too, because an empty base string is the one that makes every other
    // check vacuous.
    for (const locale of SUPPORTED_LOCALES) {
      const leaves = leavesOf(LOCALE_STRINGS[locale]);
      const empty = leaves.filter(([, value]) => typeof value !== 'string' || value.trim() === '');
      expect({ locale, empty: empty.map(([path]) => path) }).toEqual({ locale, empty: [] });
    }
  });

  it('keeps {placeholder} parity with en in every locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      if (locale === 'en') continue;
      const byKey = new Map(leavesOf(LOCALE_STRINGS[locale]));
      for (const key of enKeys) {
        expect({ locale, key, placeholders: placeholdersOf(byKey.get(key)) }).toEqual({
          locale,
          key,
          placeholders: placeholdersOf(enByKey.get(key)),
        });
      }
    }
  });

  it('leaves no placeholder for an interpolator that no longer exists', () => {
    // Durable-DAV deleted `formatBackendString` together with the data that
    // needed it, and asserts the bundle carries none. A `{placeholder}` here
    // would reach a client verbatim, because nothing substitutes it.
    const collect = (node: Record<string, unknown>, out: string[]): void => {
      for (const value of Object.values(node)) {
        if (value !== null && typeof value === 'object') collect(value as Record<string, unknown>, out);
        else if (typeof value === 'string' && /\{\w+\}/.test(value)) out.push(value);
      }
    };
    for (const locale of SUPPORTED_LOCALES) {
      const found: string[] = [];
      collect(LOCALE_STRINGS[locale] as unknown as Record<string, unknown>, found);
      expect({ locale, found }).toEqual({ locale, found: [] });
    }
  });
});

describe('getLocalizedStrings', () => {
  it('serves the English bundle for en', () => {
    const strings: BackendStrings = getLocalizedStrings('en');
    expect(strings).toBe(LOCALE_STRINGS.en);
    expect(strings.common.unauthorized).toBe('Authentication Required.');
    expect(strings.common.forbidden).toBe('Access Denied.');
    expect(strings.common.internalError).toBe('Internal Server Error.');
  });

  it('serves a translated bundle for a supported locale', () => {
    const strings = getLocalizedStrings('ja');
    expect(strings).toBe(LOCALE_STRINGS.ja);
    expect(strings.common.internalError).toBe('サーバー内部エラー。');
    expect(strings.common.internalError).not.toBe(LOCALE_STRINGS.en.common.internalError);
  });

  it('actually localizes rather than echoing English everywhere', () => {
    // Guards against a bundle silently falling back to the English text, which
    // a key-parity check cannot see: `en` and a translated `de` are identical
    // in shape and only differ in bytes.
    for (const locale of SUPPORTED_LOCALES) {
      if (locale === 'en') continue;
      expect({ locale, internalError: getLocalizedStrings(locale).common.internalError }).not.toEqual({
        locale,
        internalError: LOCALE_STRINGS.en.common.internalError,
      });
    }
  });

  it('falls back to en for an unknown locale', () => {
    for (const locale of ['xx', 'xx-YY', 'klingon', 'zz-CN']) {
      expect({ locale, strings: getLocalizedStrings(locale) }).toEqual({ locale, strings: LOCALE_STRINGS.en });
    }
  });

  it('falls back to en for empty, missing, and non-string locales', () => {
    for (const locale of ['', '   ', null, undefined]) {
      expect(getLocalizedStrings(locale)).toBe(LOCALE_STRINGS.en);
    }
  });

  it('serves every supported locale directly', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(getLocalizedStrings(locale)).toBe(LOCALE_STRINGS[locale]);
    }
  });

  it('base-matches regional variants onto their language bundle', () => {
    expect(getLocalizedStrings('de-AT')).toBe(LOCALE_STRINGS.de);
    expect(getLocalizedStrings('fr-CA')).toBe(LOCALE_STRINGS.fr);
    expect(getLocalizedStrings('pt-BR')).toBe(LOCALE_STRINGS.pt);
    expect(getLocalizedStrings('ja-JP')).toBe(LOCALE_STRINGS.ja);
  });

  it('maps every zh variant to zh-CN and never to zh-TW', () => {
    for (const locale of ['zh', 'zh_CN', 'ZH-cn', 'zh-Hans', 'zh-Hans-CN']) {
      expect({ locale, strings: getLocalizedStrings(locale) }).toEqual({ locale, strings: LOCALE_STRINGS['zh-CN'] });
    }
    expect(getLocalizedStrings('zh-TW')).toBe(LOCALE_STRINGS['zh-TW']);
    expect(LOCALE_STRINGS['zh-TW']).not.toBe(LOCALE_STRINGS['zh-CN']);
  });

  it('never returns undefined for any tag a client could send', () => {
    for (const locale of ['', ' ', '-', '--', '_', 'en-', '-en', 'EN', 'ZH-TW', 'zh-Hant-TW', 'üü']) {
      expect(getLocalizedStrings(locale)).toBeDefined();
      expect(getLocalizedStrings(locale).common.internalError.length).toBeGreaterThan(0);
    }
  });
});

describe('canonicalizeLanguageTag', () => {
  it('folds case and separators', () => {
    expect(canonicalizeLanguageTag('zh_cn')).toBe('zh-CN');
    expect(canonicalizeLanguageTag('ZH-CN')).toBe('zh-CN');
    expect(canonicalizeLanguageTag(' en ')).toBe('en');
    expect(canonicalizeLanguageTag('pt')).toBe('pt');
    expect(canonicalizeLanguageTag('zh-hant-tw')).toBe('zh-hant-TW');
  });

  it('only title-cases two-letter subtags, so a script subtag keeps its case', () => {
    // Verbatim from the source repos: the folder is a *region* rule (`zh-CN`,
    // not `zh-cn`), not the full BCP 47 case convention, and a script subtag
    // such as `Hant` is left as sent. This is harmless for resolution — both
    // spellings reduce to base `zh` and land on `zh-CN` — but it means
    // `zh-Hant-TW` and `zh-hant-TW` are not the same canonical tag, and a
    // change here has to be deliberate rather than a drive-by.
    expect(canonicalizeLanguageTag('zh-Hant-TW')).toBe('zh-hant-TW');
    expect(getLocalizedStrings('zh-Hant-TW')).toBe(LOCALE_STRINGS['zh-CN']);
    expect(getLocalizedStrings('zh-hant-TW')).toBe(LOCALE_STRINGS['zh-CN']);
  });

  it('treats a tag of only separators as en', () => {
    for (const tag of ['', '   ', '-', '--', '_', '-_']) {
      expect(canonicalizeLanguageTag(tag)).toBe('en');
    }
  });
});

describe('normalizeLocale', () => {
  it('returns a locale that has a bundle for every input', () => {
    expect(normalizeLocale('pt')).toBe('pt');
    expect(normalizeLocale('xx')).toBe('en');
    expect(normalizeLocale('zh')).toBe('zh-CN');
    expect(normalizeLocale('')).toBe('en');
    expect(normalizeLocale(null)).toBe('en');
    expect(normalizeLocale(undefined)).toBe('en');
  });
});

describe('resolveLocalizedStrings', () => {
  it('prefers the primary locale over the fallback', () => {
    expect(resolveLocalizedStrings('zh-CN', 'ja')).toBe(LOCALE_STRINGS['zh-CN']);
    expect(resolveLocalizedStrings('de', 'zh-CN')).toBe(LOCALE_STRINGS.de);
    expect(resolveLocalizedStrings('zh-CN')).toBe(LOCALE_STRINGS['zh-CN']);
  });

  it('falls back to the second preference when the primary states no choice', () => {
    expect(resolveLocalizedStrings('xx', 'zh-CN')).toBe(LOCALE_STRINGS['zh-CN']);
    expect(resolveLocalizedStrings(null, 'ja')).toBe(LOCALE_STRINGS.ja);
    expect(resolveLocalizedStrings('en', 'ja')).toBe(LOCALE_STRINGS.ja);
  });

  it('ends at en when neither preference resolves', () => {
    expect(resolveLocalizedStrings(null, null)).toBe(LOCALE_STRINGS.en);
    expect(resolveLocalizedStrings()).toBe(LOCALE_STRINGS.en);
    expect(resolveLocalizedStrings('xx', 'yy')).toBe(LOCALE_STRINGS.en);
  });
});
