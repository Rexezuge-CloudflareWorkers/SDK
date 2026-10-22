---
'@rexezuge/shared': patch
---

`isLocalhostName` now answers about the host, not about its spelling.

DNS is case-insensitive: `LOCALHOST` names the same host as `localhost`, and
`LOCALHOST` resolves to loopback. The exported predicate compared a bare host
against a lowercase set, so `isLocalhostName('LOCALHOST')` was `false` while
`isLocalhostName('localhost')` was `true` — a hole rather than a rule, in the
one predicate a consumer reaches for when it holds a hostname and needs to ask
whether it names this machine.

The host is normalized inside the predicate rather than at each call site, for
the same reason `isPrivateOrInternalHost` normalizes before it asks: one
answer, not two.
