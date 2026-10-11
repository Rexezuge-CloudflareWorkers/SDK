---
'@rexezuge/tooling': patch
---

Fix script injection in retry-step action: pass max_attempts and delay via env instead of interpolating expressions into run.
