---
'@rexezuge/errors': minor
---

Add `SubrequestBudgetExhaustedError` (413, type `SubrequestBudgetExhausted`), converged from Edge-Sonic. All-or-nothing writes refuse to start when the invocation budget is spent; resumable writes report truncation instead. Extends `PayloadTooLargeError` with an overridden `type` (the `DatabaseError` precedent) so the catalog keeps one row per status.
