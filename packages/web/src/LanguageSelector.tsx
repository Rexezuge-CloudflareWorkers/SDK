import { LocaleUtil, SUPPORTED_LOCALES } from '@rexezuge/shared';
import { Select } from './Input.tsx';

/**
 * The language picker.
 *
 * ## Provenance
 *
 * `components/shared/LanguageSelector.tsx` in **AWS-AccessBridge**,
 * **CalDAV-Bridge**, **ChordDHT-Tracker**, **Durable-DAV**, **Durable-DAV-Router**,
 * **Edge-Git**, **Mail-Meow** and **Mail-Otter** — six real copies plus two
 * smaller ones, in two shapes.
 *
 * ## What converges away
 *
 * **The 12-locale table.** Every copy declared its own `LANGUAGE_LABELS` /
 * `NATIVE_NAMES` map — the same twelve entries, `en` through `ko`, re-typed in
 * each repo. `@rexezuge/shared`'s `LocaleUtil` already holds that table and its
 * `displayName`, converged from AWS-AccessBridge, Mail-Meow and Mail-Otter. So
 * this component now has no table of its own, and the two would have had to
 * agree by hand otherwise.
 *
 * **The `'unknown'` sentinel.** Mail-Otter spelled "the browser asked for a
 * language this app does not have" as the string `'unknown'`, which then had to
 * be compared against at every call site and could not be distinguished from a
 * locale literally spelled `unknown`. It is `null` here — absent, per the kit's
 * `AGENTS.md` — and the disabled branch renders from that.
 *
 * **The `i18n.resolvedLanguage ?? i18n.language` fallback.** The copies read
 * i18next's own state to decide what is selected. In the kit that resolution
 * belongs to `useSpaLanguage`, which already does it; this component takes the
 * resolved tag and normalizes defensively, so a caller passing a raw browser
 * tag (`en-US`) still lands on a real option.
 */

interface LanguageSelectorProps {
  /**
   * The current tag, or `null` when the app could not resolve one.
   *
   * `null` renders a disabled control reading {@link LanguageSelectorProps.unknownLabel}.
   */
  value: string | null;
  onChange: (languageTag: string) => void;
  /** The control's accessible name. Required — a bare `<select>` has none. */
  label: string;
  /** Shown instead of the language list when `value` is `null`. */
  unknownLabel: string;
  /**
   * The offered tags.
   *
   * Defaults to the family's twelve. A caller narrows this; it cannot widen it,
   * because an option with no display name in the shared table renders as its
   * raw tag.
   */
  supported?: readonly string[];
  disabled?: boolean;
}

function LanguageSelector({
  value,
  onChange,
  label,
  unknownLabel,
  supported = SUPPORTED_LOCALES,
  disabled,
}: Readonly<LanguageSelectorProps>) {
  if (value === null) {
    return (
      <Select aria-label={label} value="" disabled onChange={() => undefined}>
        <option value="">{unknownLabel}</option>
      </Select>
    );
  }

  const current = LocaleUtil.normalize(value);

  return (
    <Select aria-label={label} value={current} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {supported.map((tag) => (
        <option key={tag} value={tag}>
          {/* `displayName` normalizes first, so a supported-but-unspelled tag
              still resolves against the shared table rather than rendering raw. */}
          {LocaleUtil.displayName(tag)}
        </option>
      ))}
    </Select>
  );
}

export { LanguageSelector };
export type { LanguageSelectorProps };
