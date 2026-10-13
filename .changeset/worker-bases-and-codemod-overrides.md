---
'@rexezuge/runtime': patch
'@rexezuge/errors': patch
---

Restore the worker bases to shapes a consumer can adopt

Three defects blocked or degraded adoption in Mail-Otter, the third full-framework
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

**Docs.** `errors/README.md` listed `DatabaseError` as 502; the code and its own
test say 500, inherited from the `InternalServerError` catalog entry.
`runtime/README.md` showed `EnvParser.number`, which does not exist.
