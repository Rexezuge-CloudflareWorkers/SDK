# @rexezuge/i18n

Backend string bundle with twelve locales and `Accept-Language`-aware lookup.

Zero dependencies. The bundle is one `common` group; the locale table, the fallback chain, and the lookup are the parts every consumer boundary needs.

```bash
pnpm add @rexezuge/i18n
```

Supported locales: `en`, `de`, `fr`, `es`, `it`, `nl`, `pt`, `pl`, `ja`, `ko`, `zh-CN`, `zh-TW`.

---

## 1. Lookup

```ts
import { getLocalizedStrings, resolveLocalizedStrings } from '@rexezuge/i18n';

getLocalizedStrings('fr'); // French bundle; null/undefined/''/unknown all land on en — never undefined
resolveLocalizedStrings(acceptLanguageHeader, user.storedLocale); // header first, stored preference second
```

`resolveLocalizedStrings(locale, fallback)` models the header-plus-stored-preference pair: the stored preference only speaks when the header does not express a real choice (an explicit `en` header and an absent header are deliberately indistinguishable, so a browser sending `en` while the user picked `ja` still gets `ja`).

## 2. Shape

```ts
import { LOCALE_STRINGS, normalizeLocale, SUPPORTED_LOCALES, type BackendStrings } from '@rexezuge/i18n';

normalizeLocale('pt-BR'); // 'pt' — BCP 47 canonicalization shared with @rexezuge/shared
const bundle: BackendStrings = LOCALE_STRINGS.en;
```

`LOCALE_STRINGS` is typed as a total `Record`, so adding a locale to `SUPPORTED_LOCALES` without adding a bundle is a compile error rather than a runtime `undefined` at the boundary. Individual bundles (`enStrings`, `deStrings`, …) are also exported for migration scripts, tests, and bundle-level integrity checks. Locale-file parity (keys, empty values, `{{placeholder}}` parity) is enforced by `@rexezuge/tooling`'s `validate-locales` script.

---

## Verifying this package

```bash
pnpm --filter @rexezuge/i18n exec tsc -p tsconfig.json
pnpm --filter @rexezuge/i18n typecheck
pnpm --filter @rexezuge/i18n test
```
