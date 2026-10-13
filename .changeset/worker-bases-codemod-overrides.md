---
'@rexezuge/sdk-codemods': patch
---

Restore the codemod tables to shapes a consumer can adopt

Two defects blocked or degraded adoption in Mail-Otter, the third full-framework
consumer to reach for the kit.

**`@rexezuge/sdk-codemods` — a rename emitted imports of a symbol the kit does
not export.** `IDENTITY_RENAMES` mapped `resolveUserId` → `resolveAccountId`
un-scoped, but `resolveAccountId` exists only as a `UserIdentityService` _method_;
the `accountLookup` free function keeps the name `resolveUserId`. Running the
codemod rewrote `import { resolveUserId }` into an import of nothing, failing at
module resolution rather than at review — the failure the `CONFIG_RENAMES` note
was written to prevent. Identity renames are now member-scoped
(`IDENTITY_MEMBER_RENAMES`) and apply only at `this.x(` sites.

**`@rexezuge/sdk-codemods` — the documented override escape hatch did not
exist.** `IDENTITY_DAO_SUBPATHS` has always described "a repo can override them
by declaring its own row: that is the escape hatch for a repo whose `users`
table has columns the kit's DAO does not model". The tables are module
constants, so the only way to override a row was to edit the kit. `adopt.ts`
takes `--rules <file>` now, merging a JSON object of departures over the shipped
tables per-row. A malformed or missing file fails the run rather than falling
back, since a silent fallback would rewrite a repo against a mapping the
operator did not ask for.

**Docs.** The codemods README still advertised the removed
`Provider`/`ServiceContext` → `RequestScope` row.
