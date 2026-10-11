---
'@rexezuge/tooling': patch
---

Fix file-system race conditions in spa-shell stub creation and migration lock writes: use atomic exclusive creation and read without pre-check.
