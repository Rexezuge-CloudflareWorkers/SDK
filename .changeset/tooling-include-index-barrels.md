---
'@rexezuge/tooling': minor
---

FEAT(tooling): Add `includeIndexBarrels` To The Vitest Factories

`defineUnitVitestConfig` and `defineRepoVitestConfig` exclude `**/index.ts`
from coverage, on the reasoning that a re-export barrel carries no logic of its
own. That reasoning is wrong for a barrel nothing imports: that file is not
unexercised logic, it is dead weight, and excluding it is precisely what hides
it.

`coverageExclude` cannot express the opt-back-in, because it is _merged_ with
the canonical set rather than replacing it — so the repos that wanted barrels
counted had no way to say so, and could only fork the whole config to get it.

`includeIndexBarrels: true` lifts that one glob and leaves the rest of the
canonical set alone. It defaults to `false`, which is today's behaviour,
unchanged for every repo that never asked.
