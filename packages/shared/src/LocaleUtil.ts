/**
 * Locale negotiation against a fixed support table.
 *
 * ## Provenance
 *
 * Converged from AWS-AccessBridge's, Mail-Meow's and Mail-Otter's
 * `LocaleUtil.ts`. The three share the same 12-locale table
 * (`en, de, fr, es, it, nl, pt, pl, ja, zh-CN, zh-TW, ko`) and the same
 * `isSupported`/`normalize`; Mail-Meow and Mail-Otter additionally carry
 * `negotiate`, `displayName` and `LOCALE_DISPLAY_NAMES`. The two fuller forms are
 * byte-identical and are kept — AWS is the subset.
 *
 * ## Design decision
 *
 * The kit kept the fuller Mail-Meow/Mail-Otter surface. `normalize` is the load-
 * bearing operation: it canonicalizes a tag, maps regional fallbacks toward the
 * supported table (a bare `zh` becomes `zh-CN`), and — distinct from the generic
 * `canonicalizeLanguageTag` — titlecases a four-letter script subtag so
 * `zh-hans-cn` canonicalizes correctly before negotiation. Non-negotiable input
 * falls back to `DEFAULT_LOCALE` rather than throwing; an Accept-Language header
 * is a hint, not a contract.
 */
const DEFAULT_LOCALE = 'en';

const SUPPORTED_LOCALES = ['en', 'de', 'fr', 'es', 'it', 'nl', 'pt', 'pl', 'ja', 'zh-CN', 'zh-TW', 'ko'] as const;

type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const LOCALE_DISPLAY_NAMES: Record<SupportedLocale, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  nl: 'Nederlands',
  pt: 'Português',
  pl: 'Polski',
  ja: '日本語',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ko: '한국어',
};

function canonicalizeLocaleTag(tag: string): string {
  const normalized = tag.trim().replaceAll('_', '-');
  const parts = normalized.split('-').filter(Boolean);
  if (parts.length === 0) return '';
  const language = (parts[0] ?? '').toLowerCase();
  if (parts.length === 1) return language;
  const rest = parts.slice(1).map((part, index) => {
    if (index === parts.length - 2 && part.length === 4) {
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }
    return part.length === 2 ? part.toUpperCase() : part.toLowerCase();
  });
  return [language, ...rest].join('-');
}

class LocaleUtil {
  public static isSupported(locale: string | null | undefined): boolean {
    if (!locale || typeof locale !== 'string') return false;
    const canonical = canonicalizeLocaleTag(locale);
    return (SUPPORTED_LOCALES as readonly string[]).includes(canonical);
  }

  public static normalize(locale: string | null | undefined): SupportedLocale {
    if (!locale || typeof locale !== 'string') return DEFAULT_LOCALE;
    const canonical = canonicalizeLocaleTag(locale);
    if ((SUPPORTED_LOCALES as readonly string[]).includes(canonical)) {
      return canonical as SupportedLocale;
    }
    const base = canonical.split('-', 1)[0]?.toLowerCase() ?? '';
    if (base === 'zh') return 'zh-CN';
    const baseMatch = (SUPPORTED_LOCALES as readonly string[]).find((s) => s.toLowerCase() === base);
    if (baseMatch) return baseMatch as SupportedLocale;
    try {
      const negotiated = Intl.getCanonicalLocales(canonical);
      const primary = negotiated[0]?.split('-', 1)[0]?.toLowerCase() ?? '';
      const fallback = (SUPPORTED_LOCALES as readonly string[]).find((s) => s.toLowerCase() === primary);
      if (fallback) return fallback as SupportedLocale;
    } catch {
      // Ignore invalid tags and fall through to default.
    }
    return DEFAULT_LOCALE;
  }

  public static negotiate(preferred: string | null | undefined, fallback?: string | null): SupportedLocale {
    const primary = this.normalize(preferred);
    return primary === DEFAULT_LOCALE ? this.normalize(fallback) : primary;
  }

  public static displayName(locale: string | null | undefined): string {
    const normalized = this.normalize(locale);
    return LOCALE_DISPLAY_NAMES[normalized] ?? normalized;
  }
}

export { LocaleUtil, DEFAULT_LOCALE, SUPPORTED_LOCALES, LOCALE_DISPLAY_NAMES };
export type { SupportedLocale };
