---
'@rexezuge/runtime': patch
---

`ScheduledControllerLike` and `ExecutionContextLike` are exported.

`AbstractScheduledTask.handle` takes them and `handleScheduledTask` is
declared in terms of them, so a consumer that subclasses the base has to name
both — and could not: they were declared in the module but not exported, so
the only way to write a task was to redeclare the shapes locally and hope
they stayed in step with the ones the base actually passes.

A structural type the base's own signature names is part of the base's
contract; exporting it is what lets a consumer override `handleScheduledTask`
without a copy of the kit's declarations.
