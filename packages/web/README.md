# @rexezuge/web

React UI primitives, hooks, and API client for the family SPAs.

Depends on `@rexezuge/errors` (every rejection is a `ServiceError`) and `@rexezuge/shared`. Peer-depends on `react` + `react-dom` 19 — the kit stays version-agnostic and the app owns the renderer.

```bash
pnpm add @rexezuge/web
```

---

## 1. Components

Class-based primitives over the CSS variables every Tailwind consumer already defines (`--color-accent`, `--color-surface-*`, `--color-text-*`, `--color-{success,error,warning,info,neutral}-{bg,text}`); `Spinner` (and `Button`'s busy state) additionally needs `animate-spin`.

| Export                                                     | Notes                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| `Button` / `LoadingButton`                                 | variants + sizes via `buttonClass`; loading state with spinner |
| `Badge`                                                    | `badgeClass` / `badgeVariantClass` status pills                |
| `Card`, `CardHeader`, `CardTitle`                          | layout shells                                                  |
| `Input`, `Label`, `Select`, `Textarea`, `FocusInput`       | form controls, `fieldClass` shared styling                     |
| `Pagination` (+ `pageWindow`, `pageCountFor`, `clampPage`) | windowed page navigation                                       |
| `Spinner`                                                  | standalone busy indicator                                      |
| `theme` (+ `buttonColors`, `inputStyle`, …)                | legacy inline-style escape hatch                               |
| `cn`                                                       | conditional class join                                         |

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

- **`useNotice`** — timed notice stack (`NOTICE_TIMEOUT_MS`, `COPY_FEEDBACK_TIMEOUT_MS`); `showNotice` returns a dismiss handle.
- **`useSpaLanguage`** — `localStorage`-persisted language with `Accept-Language` default (`DEFAULT_SUPPORTED_LANGUAGES`, `resolveLanguageTag`, `canonicalizeLanguageTag`).
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
