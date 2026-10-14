---
'@rexezuge/runtime': patch
'@rexezuge/tooling': patch
'@rexezuge/errors': patch
'@rexezuge/shared': patch
'@rexezuge/d1': patch
'@rexezuge/http': patch
'@rexezuge/i18n': patch
'@rexezuge/identity': patch
---

Added `AbstractScheduledTask#describeFailure`, so a consumer can redact an
error's message before it is persisted to its run-record table.

The Template Method wrote `error instanceof Error ? error.message : String(error)`
straight into `failRun`. That is right for a console log and wrong for a row a
**user reads back**: task-run history is surfaced through an authenticated
route, so a failure whose message carries a bearer token, an OAuth token or a
signed action URL writes credential material into the database and hands it to
whoever loads that screen.

The kit cannot do the redaction itself — `runtime` is the DI and platform layer
and taking a dependency on the logging packages that carry those rules would
invert the package graph — so the seam belongs here. Overriding it routes the
value through the consumer's own redactor:

```ts
protected override describeFailure(error: unknown): string {
  return ErrorSanitizationUtil.sanitizeErrorForLogging(error);
}
```

Without the seam the only options were to accept an unredacted persisted
message or to keep a private copy of the whole Template Method. Five of the
seven repos this file was converged from have exactly that redactor, so all five
were carrying a duplicated base class.
