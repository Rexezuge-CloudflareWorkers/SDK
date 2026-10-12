---
'@rexezuge/tooling': patch
---

Fix `defineRepoLintConfig` ordering: the sonarjs `recommended` preset was assembled between `UNICORN_RULES` and the rules it relaxes, re-enabling six deliberate family offs (`void-use`, `different-types-comparison`, `use-type-alias`, `redundant-type-aliases`, `no-nested-assignment`, `no-all-duplicated-branches`) as errors in every consumer. Both presets now assemble before the off-blocks.
