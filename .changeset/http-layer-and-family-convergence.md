---
'@rexezuge/errors': patch
'@rexezuge/identity': minor
'@rexezuge/runtime': minor
'@rexezuge/shared': minor
'@rexezuge/d1': minor
'@rexezuge/http': minor
'@rexezuge/web': minor
---

Converge the family's HTTP layer and web primitives into the kit, and fix the
defects found while auditing the existing packages against the rest of the
family.

**New — `@rexezuge/http`.** The rate limiter, security headers, Cloudflare
Access auth, error mapper and route bases were four copies each across
Durable-DAV, Durable-DAV-Router, Edge-Git and Edge-Sonic. Edge-Sonic's variants
were the ones that had solved the defects the others still carried, so those are
the base: the per-request bucket sweep, the resolver-valued `max`, the
`Retry-After` header, the `env.ACCESS` binding that replaced an
`executionCtx.access` branch that could never execute, and the
`securityHeaders` `no-store` predicate — now a **required** argument, because a
predicate copied from another router's route table is an unconditional no-op
rather than a conservative default.

**D1 and identity read `null` for an absent row**, matching `D1Result.first()`,
`KVNamespace.get()`, and every service above them. `CursorCodec.decodeOrThrow` no
longer answers "absent" as well as "malformed": absence is the caller's decision
and `decode` is the lenient path.

**New — `AbstractScheduledTask` / `TaskRegistry`** in `@rexezuge/runtime`, from
the seven copies that ranged from 13 to 103 lines. Run bookkeeping, failure
recording, and a recorder port so `runtime` keeps no D1 dependency.

**New — OAuth2 PKCE helpers** in `@rexezuge/shared`, from the byte-identical
pair in Mail-Meow and Mail-Otter.

**New — `ModalShell`, `ConfirmDeleteModal`, `LoadingSpinner`, `EmptyState`** in
`@rexezuge/web`. Deliberately dependency-free: labels arrive as props rather
than from `useTranslation`, so adopting these does not require a translation
library or an icon set.

**`adopt.ts` implements `--remove-packages`.** The flag was documented as step 3
of the migration and read `void removePackages;`. It now reports workspace
packages whose imports reached zero — with reference counts for the ones that did
not, so the list is never mistaken for the whole picture — and deletes only on
`--write --remove-packages`. `flagValue` no longer returns the positional root as
the scope when `--scope` is absent, which made a missing flag a silent no-op run.

The orchestrator gains its own suite (`adopt.test.ts`, 11 cases) covering the
`--write`-across-a-repo path that previously had none, including idempotency.
