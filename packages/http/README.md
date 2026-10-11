# `@rexezuge/http`

The family's HTTP layer: Hono middleware, route bases, Cloudflare Access auth,
and error→response mapping.

## Why this package exists

Eight other packages in the kit are framework-free on purpose, and that is what
lets a repo adopt `shared` / `errors` / `runtime` without adopting a web
framework. The pieces in here cannot be framework-free — they are Hono- and
chanfana-shaped — and the zero-dependency rule silently prevented the fix while
four repos each shipped four copies.

So this is the one package that breaks the rule, deliberately. Nothing in the
other eight imports it, so a repo that wants the framework-free core can keep
taking only that.

## What converged here

| Module            | From                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `rateLimit`       | Edge-Sonic's — the copy that fixed the per-request sweep, the resolver `max`, and the `Retry-After` header |
| `securityHeaders` | Four byte-identical copies, with the `no-store` predicate made a **required** argument                     |
| `accessAuth`      | Edge-Sonic's — the copy that replaced a `ctx.access` branch that could never execute                       |
| `ErrorMapper`     | Edge-Sonic's — split by surface, not by convenience                                                        |
| `routeBase`       | All three incompatible shapes, with their shared parts converged                                           |

## The three decisions worth knowing

**`rateLimit`'s `max` may be a resolver.** The route table is built once in the
worker constructor, where `env` does not exist. Reading a `*_RATE_LIMIT` var
there produces a module-level constant wearing a variable's name — which is how
one repo shipped a declared, validated, templated variable that the limiter never
read. A resolver is evaluated per request instead. An unusable resolver **fails
open**, because a broken one would otherwise silently turn the limiter off.

**The sweep is time-triggered, the cap is not.** The bucket cap is enforced on
every request, because memory grows whether or not a sweep runs. The expiry
sweep runs at most once per 30s, because its cost was previously paid by every
caller rather than by the one who filled the map — which made a rate limiter a
denial-of-service vector against itself.

**`securityHeaders` requires its `no-store` predicate.** One repo shipped
`startsWith('/user/')` against a worker that serves no `/user/` route, so the
predicate could never return `true` and `Cache-Control: no-store` was never
applied to anything. A predicate copied from another router's route table is not
a conservative default; it is an unconditional no-op. Passing it is required so
the compiler asks.

## Usage

```ts
import { rateLimit, securityHeaders, sensitivePaths, createRouteHandler } from '@rexezuge/http';

const app = new Hono();

app.use('*', securityHeaders(sensitivePaths('/user', '/internal')));
app.use('/user/*', userAuthentication());
// After auth: the limiter prefers the resolved identity over the client address.
app.use('/user/*', rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'user' }));

const listVolumes = createRouteHandler(async (c) => c.json(await scope.get(Tokens.VolumeDAO).list()));
```

A surface with its own wire envelope (Subsonic, CalDAV) supplies `onThrottled`
and `toResponse`; everything else gets the canonical `{Exception:{Type,Message}}`
dialect every SPA in the family decodes.

## Context types are structural

Every entry point takes a context _shape_ (`RateLimitContext`, `HeaderContext`,
`RouteContext`) rather than Hono's `Context<…>`. That keeps this package from
pinning the generic parameters, lets a bare-`Request` dispatcher share the same
middleware, and makes every suite runnable in plain Node — which is what the
tests here do.

## Null and undefined

`null` means absent, `undefined` means not supplied — see the kit's `AGENTS.md`.
Never compare one of these results against `undefined`: `null` does not equal it,
so the check silently goes false and reads as "always present".
