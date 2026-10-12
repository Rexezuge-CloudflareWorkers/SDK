import { useCallback, useEffect, useMemo, useState } from 'react';
import { canonicalizeLanguageTag } from '@rexezuge/shared';
import type { LanguageTag } from '@rexezuge/shared';

/**
 * The language the SPA is rendering, and the setter that changes it.
 *
 * ## Provenance
 *
 * `hooks/useSpaLanguage.ts` in **AWS-AccessBridge**, **Durable-DAV**,
 * **Durable-DAV-Router**, **Edge-Git**, **Edge-Sonic** and **Mail-Otter** — six
 * copies that agree on the detection precedence and disagree on everything
 * else, because each one also owned its app's i18next wiring:
 *
 * - **Detection precedence.** All six: backend `preferredLanguage` when present
 *   > `localStorage` > `navigator.language` > `en`, with the *first present
 *   source* winning rather than the first *supported* one — AWS's
 *   `lib/language.ts` spells out why: an unsupported backend value falls to
 *   `en` rather than to the next source, because the backend value is the
 *   user's own choice and silently replacing it with whatever the browser
 *   reports would flip the UI the moment the profile loaded.
 * - **`<html lang>` sync**, in all six, guarded because a non-browser
 *   environment has no `document`.
 * - **Bundle loading, `languageChanged` bridging, and the backend write** —
 *   Mail-Otter/AWS `await updatePreferredLanguage(...)`, the others
 *   localStorage-only. These are *left to the app*: the kit hook keeps
 *   i18next out so it can be exercised without an i18n instance, and a caller
 *   that wants the authoritative save calls its own API from its `setLanguage`
 *   wrapper.
 * - **`languageStatus`/`languagePending`** — left out for the same reason: both
 *   exist to describe *bundle* loading, which the app now owns.
 *
 * ## Normalization
 *
 * The hook returns `{ language, setLanguage }`. `setLanguage` is synchronous and
 * total: it resolves the tag, persists it, and syncs `<html lang>`; the caller
 * awaits its own bundle load before or after calling it. `supported` comes back
 * too, so a `LanguageSelector` does not need a second import to render the list.
 */

/**
The tags offered when a caller does not say. English-only is the safe default.
*/
const DEFAULT_SUPPORTED_LANGUAGES: readonly LanguageTag[] = ['en'];

/**
The tag used when nothing supported can be resolved.
*/
const DEFAULT_FALLBACK_LANGUAGE: LanguageTag = 'en';

/**
The `localStorage` key used when a caller does not say.
*/
const DEFAULT_LANGUAGE_STORAGE_KEY = 'language';

/**
One entry of the supported list, pre-canonicalized for comparison.
*/
interface SupportedLanguage {
  /**
  The tag as the caller spells it — what the hook returns.
  */
  tag: LanguageTag;
  /**
  Its canonical form, for matching.
  */
  key: string;
  /**
  Its primary subtag (`zh` for `zh-CN`).
  */
  primary: string;
}

/**
The supported list in canonical form, computed once per render of the hook.
*/
function describeSupported(supported: readonly LanguageTag[]): SupportedLanguage[] {
  return supported.map((tag) => {
    const key = canonicalizeLanguageTag(tag);
    return { tag, key, primary: key.split('-', 1)[0] ?? key };
  });
}

/**
 * Resolves a tag against the supported list: an exact match wins, then the
 * primary subtag (`de-DE` resolves to a supported `de`), then the fallback.
 *
 * The prefix step is why a browser reporting `en-US` does not defeat an
 * English-only app, and why a browser reporting `zh-TW` does not land on
 * `zh-CN` when both are supported.
 */
function resolveLanguageTag(value: string | null | undefined, supported: readonly LanguageTag[], fallback: LanguageTag): LanguageTag {
  if (typeof value !== 'string' || value.trim() === '') {
    return fallback;
  }
  // The shared canonicalizer maps a degenerate tag to `en`, so the empty check
  // above has to happen first — otherwise an empty stored value would silently
  // resolve to `en` instead of the caller's fallback.
  const key = canonicalizeLanguageTag(value);
  const primary = key.split('-', 1)[0] ?? key;
  let prefixMatch: LanguageTag | null = null;
  for (const entry of describeSupported(supported)) {
    if (entry.key === key) {
      return entry.tag;
    }
    if (prefixMatch === null && entry.primary === primary) {
      prefixMatch = entry.tag;
    }
  }
  return prefixMatch ?? fallback;
}

function readStoredLanguage(storageKey: string): string | null {
  try {
    return globalThis.localStorage?.getItem(storageKey) ?? null;
  } catch {
    // Private-mode Safari and a blocked-storage context both throw. Detection
    // carries on without the stored value; the language still works.
    return null;
  }
}

function writeStoredLanguage(storageKey: string, language: LanguageTag): void {
  try {
    globalThis.localStorage?.setItem(storageKey, language);
  } catch {
    // Non-fatal: the selection still applies to this session, it just does not
    // survive a reload.
  }
}

function readNavigatorLanguage(): string | null {
  try {
    return globalThis.navigator?.language ?? null;
  } catch {
    return null;
  }
}

interface UseSpaLanguageOptions {
  /**
   * The backend-authoritative preference (a user's `preferredLanguage`), or
   * `null`/`undefined` while the profile is not known. Adopted when it changes.
   */
  preferred?: string | null;
  /**
  The tags the app ships bundles for. Memoize it: it is a dependency.
  */
  supported?: readonly LanguageTag[];
  /**
  The `localStorage` key the choice is persisted under.
  */
  storageKey?: string;
  /**
  The tag used when nothing supported resolves. Defaults to `en`.
  */
  fallbackLanguage?: LanguageTag;
}

interface UseSpaLanguageResult {
  /**
  The tag currently in effect — a member of `supported`.
  */
  language: LanguageTag;
  /**
   * Switches the language: resolves the tag, persists it, and syncs
   * `<html lang>`. An unsupported tag resolves to the fallback rather than
   * being ignored, so a mistake is visible instead of silent.
   */
  setLanguage: (tag: string) => void;
  /**
  The tags offered, as resolved — render this list in a selector.
  */
  supported: readonly LanguageTag[];
}

function useSpaLanguage({
  preferred,
  supported = DEFAULT_SUPPORTED_LANGUAGES,
  storageKey = DEFAULT_LANGUAGE_STORAGE_KEY,
  fallbackLanguage = DEFAULT_FALLBACK_LANGUAGE,
}: Readonly<UseSpaLanguageOptions> = {}): UseSpaLanguageResult {
  // Serialized so an inline `supported` array literal does not change identity
  // on every render and re-run the effects below. Tags never contain spaces.
  const supportedKey = supported.join(' ');
  const supportedLanguages = useMemo<readonly LanguageTag[]>(() => (supportedKey === '' ? [] : supportedKey.split(' ')), [supportedKey]);

  const [language, setLanguageState] = useState<LanguageTag>(() =>
    // Precedence: backend > stored > navigator > fallback. The backend value is
    // undefined on a first paint and arrives later, which is what the adoption
    // below is for.
    resolveLanguageTag(preferred ?? readStoredLanguage(storageKey) ?? readNavigatorLanguage(), supportedLanguages, fallbackLanguage),
  );

  // Adopt the backend preference once it is known. `preferred` is the
  // authoritative source, so it overrides a value detection picked earlier —
  // which is also what makes a returning user land on the language they chose
  // on another device.
  //
  // Adjusted during render, not in an effect: the guarded `prevPreferred`
  // comparison is React's documented derive-from-props pattern, and it adopts
  // in the render the value arrives in rather than one render later.
  const [prevPreferred, setPrevPreferred] = useState<string | null | undefined>(preferred);
  if (preferred !== prevPreferred) {
    setPrevPreferred(preferred);
    if (preferred !== undefined && preferred !== null && preferred.trim() !== '') {
      const next = resolveLanguageTag(preferred, supportedLanguages, fallbackLanguage);
      if (next !== language) {
        setLanguageState(next);
      }
    }
  }

  // `<html lang>` drives hyphenation, font choice and screen-reader
  // pronunciation, so it has to follow the tag even when the change came from
  // detection rather than from `setLanguage`.
  useEffect(() => {
    try {
      document.documentElement.lang = language;
    } catch {
      // No DOM: server rendering, or a worker-ish test environment.
    }
  }, [language]);

  const setLanguage = useCallback(
    (tag: string) => {
      const next = resolveLanguageTag(tag, supportedLanguages, fallbackLanguage);
      setLanguageState((current) => (current === next ? current : next));
      // Persisted only on an explicit choice. Writing on mount would turn "the
      // browser happened to report `de`" into a stored preference, which is a
      // different claim.
      writeStoredLanguage(storageKey, next);
    },
    [supportedLanguages, fallbackLanguage, storageKey],
  );

  return { language, setLanguage, supported: supportedLanguages };
}

export { DEFAULT_FALLBACK_LANGUAGE, DEFAULT_LANGUAGE_STORAGE_KEY, DEFAULT_SUPPORTED_LANGUAGES, resolveLanguageTag, useSpaLanguage };
export type { UseSpaLanguageOptions, UseSpaLanguageResult };

export { canonicalizeLanguageTag, type LanguageTag } from '@rexezuge/shared';
