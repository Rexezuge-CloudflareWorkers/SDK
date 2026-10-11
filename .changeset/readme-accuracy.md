---
'@rexezuge/errors': patch
---

`README.md` documented `toResponse()`, which does not exist — the method is
`toErrorResponse()`. The package table and the consumer list are corrected too:
the README claimed all nine full-framework repos adopt `identity` and `web`,
while two (`CalDAV-Bridge`, `Durable-DAV`) actually depend on the kit today.
