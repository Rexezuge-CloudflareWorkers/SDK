import { describe, expect, it } from 'vitest';
import { LocaleUtil, SUPPORTED_LOCALES } from './LocaleUtil.ts';

// Converged from Mail-Meow/Mail-Otter's LocaleUtil (full negotiate/displayName set).
describe('LocaleUtil', () => {
  it('ships the twelve-locale table', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'de', 'fr', 'es', 'it', 'nl', 'pt', 'pl', 'ja', 'zh-CN', 'zh-TW', 'ko']);
  });

  it('isSupported accepts canonical tags and rejects out-of-table ones', () => {
    expect(LocaleUtil.isSupported('fr')).toBe(true);
    expect(LocaleUtil.isSupported('zh-CN')).toBe(true);
    expect(LocaleUtil.isSupported('fr-CA')).toBe(false);
    expect(LocaleUtil.isSupported(null)).toBe(false);
    expect(LocaleUtil.isSupported('')).toBe(false);
  });

  it('normalize canonicalizes casing and drops unknown region subtags', () => {
    expect(LocaleUtil.normalize('DE')).toBe('de');
    expect(LocaleUtil.normalize('pt-BR')).toBe('pt');
    expect(LocaleUtil.normalize('en-GB')).toBe('en');
  });

  it('normalize maps a bare zh to zh-CN and keeps an explicit one', () => {
    expect(LocaleUtil.normalize('zh')).toBe('zh-CN');
    expect(LocaleUtil.normalize('zh-TW')).toBe('zh-TW');
  });

  it('normalize titlecases a four-letter script subtag (LocaleUtil, not LanguageTag)', () => {
    // This is the divergence from canonicalizeLanguageTag, which would lowercase it.
    expect(LocaleUtil.normalize('zh-hans-cn')).toBe('zh-CN');
  });

  it('normalize falls back to the default for unnegotiable input', () => {
    expect(LocaleUtil.normalize(null)).toBe('en');
    expect(LocaleUtil.normalize('xx-YY')).toBe('en');
  });

  it('negotiate prefers a supported primary, else the fallback', () => {
    expect(LocaleUtil.negotiate('fr', 'en')).toBe('fr');
    expect(LocaleUtil.negotiate(null, 'fr')).toBe('fr');
    expect(LocaleUtil.negotiate('xx', 'de')).toBe('de');
  });

  it('displayName returns the localized endonym', () => {
    expect(LocaleUtil.displayName('ko')).toBe('한국어');
    expect(LocaleUtil.displayName('zh-TW')).toBe('繁體中文');
    expect(LocaleUtil.displayName(null)).toBe('English');
  });
});
