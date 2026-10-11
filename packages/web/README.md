# @rexezuge/web

React UI primitives, hooks, and API client for the family SPAs.

Depends on `@rexezuge/errors` (every rejection is a `ServiceError`) and `@rexezuge/shared`. Peer-depends on `react` + `react-dom` 19 — the kit stays version-agnostic and the app owns the renderer — and on `lucide-react` `^1.49`, which three of the converged components use for their glyphs.

**Glyphs in, strings out.** No component in this package calls `useTranslation`: every label is a prop, because the app rendering a dialog knows what it says. Icons are the exception — vendoring a glyph's path data freezes it at whatever version was current when it was copied, so `lucide-react` is a peer and the icons come from the app's own copy. `Button` deliberately keeps using this package's own `Spinner` rather than lucide's `Loader2`; chrome is cheap to draw, iconography is not.

```bash
pnpm add @rexezuge/web
```

---

## 1. Components

Class-based primitives over the CSS variables every Tailwind consumer already defines (`--color-accent`, `--color-surface-*`, `--color-text-*`, `--color-{success,error,warning,info,neutral}-{bg,text}`); `Spinner` (and `Button`'s busy state) additionally needs `animate-spin`.

| Export                                                     | Notes                                                                   |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `Button` / `LoadingButton`                                 | variants + sizes via `buttonClass`; loading state with spinner          |
| `Badge`                                                    | `badgeClass` / `badgeVariantClass` status pills                         |
| `Card`, `CardHeader`, `CardTitle`                          | layout shells                                                           |
| `Input`, `Label`, `Select`, `Textarea`, `FocusInput`       | form controls, `fieldClass` shared styling                              |
| `Pagination` (+ `pageWindow`, `pageCountFor`, `clampPage`) | windowed page navigation                                                |
| `Spinner`                                                  | standalone busy indicator                                               |
| `AppPage`                                                  | `wide` / `narrow` / `hero` page container                               |
| `PageHeaderCard`                                           | the standard page-title header                                          |
| `ContextBar`                                               | sticky sub-page bar; `home` is a node, so no router is imposed          |
| `Unauthorized`                                             | the "not signed in" page                                                |
| `NoticeBar`                                                | renders `useNotice`'s own `Notice`; errors assert, successes are polite |
| `LanguageSelector`                                         | the 12-locale picker, off `LocaleUtil`'s shared table                   |
| `ModalShell`                                               | portal dialog frame; a click inside never reaches the backdrop          |
| `ConfirmDeleteModal`                                       | an always-armed destructive confirmation                                |
| `TypeToConfirmModal`                                       | arms only on an exact name match                                        |
| `RefreshButton`                                            | refresh control, `loading` blocks activation                            |
| `ReadOnlyField`                                            | read-only value with an optional copy button                            |
| `EmptyState` / `LoadingSpinner`                            | the shared page states                                                  |
| `theme` (+ `buttonColors`, `inputStyle`, …)                | legacy inline-style escape hatch                                        |
| `cn`                                                       | conditional class join                                                  |

```tsx
import { Button, Card, CardHeader, CardTitle, useNotice } from '@rexezuge/web';

function Panel() {
  const { notices, showNotice } = useNotice();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tokens</CardTitle>
      </CardHeader>
      <Button onClick={() => showNotice('Saved', { kind: 'success' })}>Save</Button>
    </Card>
  );
}
```

## 2. Hooks

- **`useNotice`** — one transient message, `{ notice, showNotice, dismissNotice }`. `notice` is `null` when there is nothing to say, which is what `NoticeBar` takes. A new notice replaces the old one's pending dismissal rather than stacking a second timer.
- **`useCopyToClipboard`** — `{ copied, copy }`, where `copied` becomes true **only** after a write that actually resolved. A denied permission or a plain-HTTP deployment leaves it `false`, which is the answer that matters: there is nothing to undo. Every value the family copies is a credential or an identifier, so a false success sends the operator away believing they have something they do not.
- **`useSpaLanguage`** — `localStorage`-persisted language with `Accept-Language` default (`DEFAULT_SUPPORTED_LANGUAGES`, `resolveLanguageTag`, `canonicalizeLanguageTag`). Hand the resolved tag to `LanguageSelector`.
- **`useCurrentUser`** — fetches `CURRENT_USER_PATH` (`/user`), with loading/error states for shell gating.

## 3. API client

```ts
import { createApiClient } from '@rexezuge/web';

const api = createApiClient({ baseUrl: '', fetchFn: fetch });
const me = await api.get('/user'); // typed JSON; 204/empty bodies resolve to undefined
```

Every rejection is a `ServiceError` with `status` / `type` / `retryable`, decoded from the family `{ Exception: { Type, Message } }` envelope first, then the legacy `{ error, message }` shape; markup bodies are treated as absent and messages truncate at `MAX_ERROR_MESSAGE_LENGTH` (500). `buildQuery` encodes `QueryParams`. Deliberately excluded: the D1 bookmark header, the authed-first public fallback, WebDAV `207` handling, and per-app `SUPPORTED_LANGUAGES` — each had exactly one consumer, so each stays with it.

---

## Verifying this package

```bash
pnpm --filter @rexezuge/web exec tsc -p tsconfig.json
pnpm --filter @rexezuge/web typecheck
pnpm --filter @rexezuge/web test
```
