---
'@rexezuge/runtime': minor
---

`createLogger` takes an optional sink, and `AbstractScheduledTask.handle`
re-throws. Both are the kit being given back a seam it had no room for, found by
the consumer whose own copies were the source of these two modules.

## `createLogger(namespace, repoName, env, sink?)`

The emit machinery — level resolution, namespace prefix, argument list — is the
kit's; **what happens to the bytes is the consumer's**, and until now there was no
way to say so. A consumer whose surfaces handle AWS `SecretAccessKey`s, session
tokens and HMAC secrets cannot let an arbitrary object reach `console.*`, and the
defence that actually holds is applied at the sink, because a check at each call
site is a hundred chances to forget one. Without a seam, that consumer either
reimplements the logger (level resolution included) or ships secrets to the log
tail.

`LogSink` is `(level, message, args) => void`, receiving the level and the
already-prefixed message. `consoleSink` is exported and is the default, so a
consumer can wrap rather than rebuild. The level filter still runs **before** the
sink, so a suppressed `debug` never reaches a redacting sink to be redacted.

The deny-list stays in the consumer, deliberately: which key names mean "secret"
is a property of one repo's data model, and a kit that guesses across nine
repos' vocabularies redacts diagnostic fields and trains everyone to ignore the
markers.

## `AbstractScheduledTask.handle` re-throws after recording

The template recorded `failRun` and then swallowed. That makes the run record the
_only_ evidence: a cron Durable Object that catches the rejection is the only
party that knows which invocation failed, and swallowing inside the task turned
that invocation into a success — an operator reading the schedule saw
"completed" for a task that had failed outright, with the reason one unrelated
screen away.

It now re-throws, and the record is written **before** the error leaves, so a
caller that catches it finds a `failed` row behind it rather than one stuck at
`running`. `protected swallowErrors()` is the documented opt-out, because the
opposite is a legitimate deployment choice — a platform that retries a cron
rejection wants the whole batch re-run, and a per-task throw is the wrong blast
radius. It changes who learns about a failure, never whether it is remembered.
