# @rexezuge/sdk — Software Development Kit

The shared foundation for the `Rexezuge-CloudflareWorkers` family of Cloudflare
Workers monorepos.

**Full-framework repos** (nine; each carries a copy of the framework floor and is
a candidate for adoption): AWS-AccessBridge, CalDAV-Bridge, ChordDHT-Tracker,
Durable-DAV, Durable-DAV-Router, Edge-Git, Edge-Sonic, Mail-Meow, Mail-Otter.
Every one except ChordDHT-Tracker, which authenticates by certificate rather
than user accounts, also has an `identity` surface.

**Adopted today:** CalDAV-Bridge and Durable-DAV depend on `@rexezuge/{d1,
errors, runtime, shared}`. The other seven still carry in-repo copies of
`backend-errors` / `backend-runtime` / `backend-data` / `shared` that this repo
was built to converge; `codemods/` performs the migration mechanically. Where a
repo's copy has drifted from the canonical form, the drift is the reason it has
not adopted yet, not a reason the kit is wrong — see `AGENTS.md` for the rules
that keep a converged file converged.

**Tooling-only repos** (adopt `tooling` plus the `web`/`functions` pieces they
actually share): Records-Provider, TOTP-Generator.

Nine frameworks lived as copies inside those repos and drifted. This repo holds
their canonical, converged form. **The kit follows the best design; consuming
repos adapt to it.**

## Packages

| Package              | Contents                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `@rexezuge/errors`   | Catalog-driven HTTP/service error taxonomy, retry markers, `toErrorResponse()`                                                                 |
| `@rexezuge/runtime`  | DI `Container`/`Token`/`RequestScope`, `AppConfiguration`, `EnvParser`, base workers, logger, `KvCache`, scheduled-task base, redacting logger |
| `@rexezuge/shared`   | Pure utilities (UUID, Timestamp, Crypto, Base64, cursor codec, SSRF policy, OAuth2 PKCE, …)                                                    |
| `@rexezuge/i18n`     | Backend string bundle + 12-locale table + `getLocalizedStrings`                                                                                |
| `@rexezuge/d1`       | D1 retry engine, error classifier, `BaseDAO`, AES-GCM                                                                                          |
| `@rexezuge/identity` | `UserIdentityService`, user DAOs, canonical identity migrations + upgrade test                                                                 |
| `@rexezuge/web`      | React UI primitives, hooks (`useNotice`, `useSpaLanguage`, `useCurrentUser`), API client                                                       |
| `@rexezuge/http`     | Hono/chanfana layer: rate limiter, security headers, route bases, Cloudflare Access auth, error mapper                                         |
| `@rexezuge/tooling`  | ESLint config factory, vitest/vite bases, scripts, GitHub Actions workflow templates                                                           |

Packages are versioned in lockstep via Changesets; a single version covers all
nine. See `.changeset/README.md` for how to add a changeset.

`@rexezuge/http` is the one package that breaks the zero-framework-dependency
rule the other eight keep, and that is the point of it: the rate limiter, the
security headers, and the route bases are Hono- and chanfana-shaped. Converging
them into a framework-free package would have bent the kit's design to preserve
a rule those files could not satisfy anyway.

## Layout

```
packages/errors/      packages/runtime/     packages/shared/      packages/i18n/
packages/d1/          packages/identity/    packages/web/         packages/http/
packages/tooling/     codemods/             # ts-morph codemods used by consumer repos to adopt the kit
```

## Development

```bash
pnpm install
pnpm run build       # tsc emit per package → dist/
pnpm run typecheck   # typecheck source + tests
pnpm run test        # vitest per package
pnpm run checks      # all of the above
```

## Releasing

```bash
pnpm changeset            # PRs touching packages/* add one changeset file
```

Merging those PRs lets the `Version Packages` workflow open a
`CHORE: Version Packages vX.Y.Z` PR that bumps every `@rexezuge/*` version together
(the workflow stamps the new version into the title and closes superseded version PRs).
Merge it, cut a GitHub Release, and the `Publish` workflow runs
`pnpm changeset publish`.

## Consumer adoption

Consumer repos depend on the packages via npm (or `link:` while local). Import
paths are intended to be path-for-path stable with the in-repo packages they
replace, so `codemods/` handles the rename mechanically.
