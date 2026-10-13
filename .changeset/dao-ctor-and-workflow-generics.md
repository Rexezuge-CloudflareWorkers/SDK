---
'@rexezuge/d1': patch
'@rexezuge/runtime': patch
---

Two corrections Mail-Otter's adoption surfaced, both found by compiling against the 1.6.1 release

**`BaseDAO`'s constructor was `protected`, which blocked the composition root.**
Every consumer wires its DAOs through a DI container that binds
`() => new UserDAO(db)`, so concrete DAOs are instantiated from outside their own
declaration — and a `protected` constructor makes that a type error. The
modifier bought nothing: the class is `abstract`, so `new BaseDAO()` was already
impossible, and the field it was guarding (`database`) carries its own
`protected`. It prevented zero illegal constructions while forcing each concrete
DAO to redeclare a pass-through constructor that added no invariant. Mail-Otter
has 18 of them. Now public.

**`AbstractWorkflowWorker`'s type parameters were in the wrong order.** The new
base led with `TEnv`, but every consumer in the family writes
`AbstractWorkflowWorker<TPayload, TResult>` — so a two-argument instantiation
silently reinterpreted the workflow's _payload_ type as its _environment_, and
the payload then failed to satisfy `Rpc.Serializable` at every `step.do` call.
`TEnv` moves last and stays defaulted, so the family's existing two-parameter
form keeps working and `this.env` is still typed.
