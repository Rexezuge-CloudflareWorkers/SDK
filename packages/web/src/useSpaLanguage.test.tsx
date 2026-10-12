// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import {
  canonicalizeLanguageTag,
  DEFAULT_LANGUAGE_STORAGE_KEY,
  DEFAULT_SUPPORTED_LANGUAGES,
  resolveLanguageTag,
  useSpaLanguage,
} from './useSpaLanguage.ts';

const SUPPORTED = ['en', 'de', 'fr', 'zh-CN', 'zh-TW'] as const;

beforeEach(() => {
  globalThis.localStorage?.clear();
});

afterEach(cleanup);

describe('canonicalizeLanguageTag', () => {
  it('lowercases the language, uppercases a two-letter region, keeps a script lowercase', () => {
    expect(canonicalizeLanguageTag('ZH_tw')).toBe('zh-TW');
    expect(canonicalizeLanguageTag('de-de')).toBe('de-DE');
    expect(canonicalizeLanguageTag('sr-latn-rs')).toBe('sr-latn-RS');
    expect(canonicalizeLanguageTag('en')).toBe('en');
    // Degenerate input canonicalizes to English — the shared canonicalizer's
    // documented choice. `resolveLanguageTag` is what maps a blank/unsupported
    // value to the caller's fallback, so this is the hook's contract, not the
    // canonicalizer's.
    expect(canonicalizeLanguageTag(' '.repeat(3))).toBe('en');
  });
});

describe('resolveLanguageTag', () => {
  const supported: readonly string[] = ['en', 'de', 'zh-CN', 'zh-TW'];

  it('matches a supported tag case-insensitively', () => {
    expect(resolveLanguageTag('ZH-tw', supported, 'en')).toBe('zh-TW');
    expect(resolveLanguageTag('de', supported, 'en')).toBe('de');
  });

  it('falls back to the primary subtag before giving up', () => {
    expect(resolveLanguageTag('de-AT', supported, 'en')).toBe('de');
    // `zh-TW` is supported in its own right, so a `zh-TW` browser does not land
    // on `zh-CN` just because that entry comes first.
    expect(resolveLanguageTag('zh-TW', supported, 'en')).toBe('zh-TW');
    expect(resolveLanguageTag('zh-HK', supported, 'en')).toBe('zh-CN');
  });

  it('falls back for anything it cannot resolve', () => {
    expect(resolveLanguageTag(undefined, supported, 'en')).toBe('en');
    expect(resolveLanguageTag(null, supported, 'en')).toBe('en');
    expect(resolveLanguageTag('', supported, 'en')).toBe('en');
    expect(resolveLanguageTag('ja', supported, 'en')).toBe('en');
  });
});

describe('useSpaLanguage', () => {
  it('starts from the stored choice', () => {
    globalThis.localStorage?.setItem(DEFAULT_LANGUAGE_STORAGE_KEY, 'de');
    const { result } = renderHook(() => useSpaLanguage({ supported: SUPPORTED }));
    expect(result.current.language).toBe('de');
  });

  it('falls back to the browser language, then the fallback', () => {
    const { result } = renderHook(() => useSpaLanguage({ supported: SUPPORTED }));
    // jsdom reports `en-US`, which resolves to the supported `en`.
    expect(result.current.language).toBe('en');

    // A browser language nothing supports leaves the fallback in place.
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'language');
    Object.defineProperty(navigator, 'language', { value: 'ja', configurable: true });
    try {
      const japanese = renderHook(() => useSpaLanguage({ supported: SUPPORTED, fallbackLanguage: 'de' }));
      expect(japanese.result.current.language).toBe('de');
    } finally {
      if (descriptor === undefined) {
        delete (navigator as { language?: string }).language;
      } else {
        Object.defineProperty(navigator, 'language', descriptor);
      }
    }
  });

  it('prefers the backend preference when it arrives', () => {
    const { result, rerender } = renderHook(
      ({ preferred }: { preferred?: string | null }) => useSpaLanguage({ preferred, supported: SUPPORTED }),
      { initialProps: { preferred: null as string | null } },
    );
    expect(result.current.language).toBe('en');

    rerender({ preferred: 'fr' });
    expect(result.current.language).toBe('fr');

    // An absent preference does not disturb what detection or the user chose.
    rerender({ preferred: null });
    expect(result.current.language).toBe('fr');
  });

  it('persists an explicit choice and syncs <html lang>', () => {
    const { result } = renderHook(() => useSpaLanguage({ supported: SUPPORTED }));
    act(() => {
      result.current.setLanguage('de');
    });
    expect(result.current.language).toBe('de');
    expect(globalThis.localStorage?.getItem(DEFAULT_LANGUAGE_STORAGE_KEY)).toBe('de');
    expect(document.documentElement.lang).toBe('de');
  });

  it('resolves an unsupported tag to the fallback rather than ignoring it', () => {
    const { result } = renderHook(() => useSpaLanguage({ supported: SUPPORTED }));
    act(() => {
      result.current.setLanguage('klingon');
    });
    expect(result.current.language).toBe('en');
  });

  it('exposes the supported list it resolved', () => {
    const { result } = renderHook(() => useSpaLanguage({ supported: SUPPORTED }));
    expect(result.current.supported).toEqual([...SUPPORTED]);
  });

  it('defaults to an English-only app', () => {
    expect(DEFAULT_SUPPORTED_LANGUAGES).toEqual(['en']);
    const { result } = renderHook(() => useSpaLanguage());
    expect(result.current.language).toBe('en');
  });
});
