---
'@rexezuge/d1': patch
'@rexezuge/errors': patch
'@rexezuge/i18n': patch
'@rexezuge/identity': patch
'@rexezuge/runtime': patch
'@rexezuge/shared': patch
'@rexezuge/tooling': patch
'@rexezuge/web': patch
---

Adopt the family's Prettier configuration (`.prettierrc`, `.prettierignore`, `.editorconfig`) and reformat the repository to match. `pnpm run format` rewrites in place; `pnpm run format:check` is the CI gate and the only one of the two that fails rather than repairing. The published `dist/` output is byte-identical — this is formatting and tooling only.
