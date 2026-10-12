import { describe, expect, it } from 'vitest';
import { canonicalizeLanguageTag } from './LanguageTag.ts';

// Converged from Durable-DAV-Router/Edge-Git's LanguageTag.ts (byte-identical).
describe('canonicalizeLanguageTag', () => {
  it('normalizes separators and BCP-47 casing', () => {
    expect(canonicalizeLanguageTag('EN_us')).toBe('en-US');
    expect(canonicalizeLanguageTag('zh-Hant-TW')).toBe('zh-hant-TW');
  });

  it('returns a bare language when only a subtag-less language is given', () => {
    expect(canonicalizeLanguageTag('EN')).toBe('en');
  });

  it('defaults to en for empty input', () => {
    expect(canonicalizeLanguageTag(' '.repeat(3))).toBe('en');
    expect(canonicalizeLanguageTag('--')).toBe('en');
  });

  it('leaves a four-letter script subtag lowercase, unlike LocaleUtil', () => {
    // The one semantic difference from canonicalizeLocaleTag, asserted here so it
    // cannot drift: LanguageTag is generic casing, not locale negotiation.
    expect(canonicalizeLanguageTag('zh-Hans-CN')).toBe('zh-hans-CN');
  });
});
