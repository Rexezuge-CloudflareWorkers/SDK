---
'@rexezuge/errors': patch
---

`CATALOG` keys and the `error.type` wire values they produce are now PascalCase (`NotFound`, `BadRequest`, `ServiceUnavailable`, …) instead of camelCase (`notFound`, `badRequest`, `serviceUnavailable`, …). This aligns the kit with the family's established envelope convention — every `backend-errors` copy spells `Exception.Type` PascalCase — so future adoptions migrate without a wire-value skew. Branch on `instanceof` or HTTP status rather than the `type` string; the `@rexezuge/web` client already maps by status and is unaffected.
