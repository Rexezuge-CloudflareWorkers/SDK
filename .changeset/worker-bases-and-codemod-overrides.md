---
'@rexezuge/runtime': patch
'@rexezuge/errors': patch
'@rexezuge/sdk-codemods': patch
---

Restore the worker bases and the codemod tables to shapes a consumer can adopt

Five defects blocked or degraded adoption in Mail-Otter, the third full-framework
consumer to reach for the kit.

**`@rexezuge/runtime` — the workflow and queue bases had lost surface they
claimed to preserve.** `AbstractWorkflowWorker` was documented as "converged
verbatim" but had dropped `extends WorkflowEntrypoint`, taking `this.env` with
it, and narrowed `step.do` to `(name, callback)` — which removes the `retries`
and `timeout` config that makes a step retryable under the platform rather than a
bare coroutine call. `AbstractQueueWorker` modelled `{ messages: T[] }`, wrong
twice over: the platform's elements are `Message<T>`, and a real batch also
carries `queue`, `metadata`, `ackAll` and `retryAll`. Both now use the platform
types; the queue batch is a type parameter, because the base only forwards it.
No consumer with a real workflow could adopt the previous shape.

**`@rexezuge/runtime` — the bases logged the caught error verbatim.** Every base
called `console.error(message, err)` with the raw caught value. That is only safe
when nothing in the call path can carry a credential, which no base can know.
Reporting now goes through an overridable `reportUnhandled(message, error)` hook
whose message stays a literal from the new `BASE_WORKER_MESSAGES` table, so a
consumer overrides the sink and never has to interpolate untrusted text into a
log line. Mail-Otter adopts this to keep the `js/clear-text-logging` posture its
`apps/background/AGENTS.md` documents.

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

**Docs.** `errors/README.md` listed `DatabaseError` as 502; the code and its own
test say 500, inherited from the `InternalServerError` catalog entry.
`runtime/README.md` showed `EnvParser.number`, which does not exist. The
codemods README still advertised the removed `Provider`/`ServiceContext` →
`RequestScope` row.
