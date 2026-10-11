# @rexezuge/errors

Catalog-driven HTTP/service error taxonomy with retry markers and wire envelopes for the Rexezuge-CloudflareWorkers family.

Zero dependencies. Every boundary in the family (route handlers, middleware, background tasks) branches on `instanceof ServiceError`, so this package sits at the bottom of the dependency graph: `d1`, `identity`, and `web` all import it.

```bash
pnpm add @rexezuge/errors
```

---

## 1. The taxonomy

`ServiceError` is the abstract root. Status, machine `type`, `retryable`, and `expose` are public fields fixed at construction — callers read them far more often than they are written.

```ts
import { NotFoundError, ServiceError } from '@rexezuge/errors';

try {
  await loadFile(id);
} catch (error: unknown) {
  const normalized = ServiceError.from(error); // ServiceError passes through; anything else becomes a 500
  return Response.json(normalized.toErrorResponse().body, { status: normalized.status });
}
```

`toErrorResponse()` returns `{ status, body }` in the family envelope `{ Exception: { Type, Message } }`. A non-exposing error (5xx) has its message substituted with a generic one — the real message is for operators, never clients.

## 2. Status classes

One class per row of `CATALOG`, so a status can never disagree with its code or default message:

| Class | Status | Exposes message |
| --- | --- | --- |
| `BadRequestError` | 400 | yes |
| `UnauthorizedError` | 401 | yes |
| `ForbiddenError` | 403 | yes |
| `NotFoundError` | 404 | yes |
| `MethodNotAllowedError` | 405 | yes |
| `ConflictError` | 409 | yes |
| `PreconditionFailedError` | 412 | yes |
| `PayloadTooLargeError` | 413 | yes |
| `UnsupportedMediaTypeError` | 415 | yes |
| `RateLimitedError` | 429 | yes |
| `InternalServerError` | 500 | no |
| `NotImplementedError` | 501 | no |
| `BadGatewayError` | 502 | no |
| `ServiceUnavailableError` | 503 | yes |
| `DatabaseError` | 502 | no |

`HttpServiceError` is the generic carrier when only a catalog entry is needed. `DatabaseError` carries the D1 classifier's verdict in its `retryable` flag.

## 3. Outcome errors

When only the throwing code knows whether a retry could help (OAuth grant revoked vs. provider throttling), it says so explicitly:

```ts
import { NonRetryableError, RetryableError } from '@rexezuge/errors';

throw new RetryableError('Provider throttled us'); // 502, retryable
throw new NonRetryableError('Grant revoked'); // 400, not retryable
```

`ProviderApiRetryableError` / `ProviderApiNonRetryableError` and `OAuth2TokenRetryableError` / `OAuth2TokenNonRetryableError` are the domain aliases. Subclasses must genuinely `extend` — an `implements` breaks the `instanceof` chain and masks typed errors as generic 500s.

---

## Verifying this package

```bash
pnpm --filter @rexezuge/errors exec tsc -p tsconfig.json
pnpm --filter @rexezuge/errors typecheck
pnpm --filter @rexezuge/errors test
```
