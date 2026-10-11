---
'@rexezuge/shared': patch
---

No behavior change. Two assertions in `TimestampUtil.test.ts` compared
wall-clock reads against each other with `toBe` — `new SystemClock().now()`
against `Date.now()` (CI caught this one: `expected 1791694464088 to be
1791694464089`) and `…InSeconds()` against a second `Date.now()` read. Two
reads of a moving clock taken milliseconds apart are not the same number, so
both now bracket the read (`before`/`after` bounds), matching the pattern and
comment `Clock.test.ts` already uses for the same hazard.
