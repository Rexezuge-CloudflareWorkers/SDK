---
'@rexezuge/identity': minor
---

FEAT(identity): Generate Account Ids From The Global `crypto`, Not `node:crypto`

`newAccountId` and `newAnchor` called `randomUUID` imported from
`node:crypto`. The value is identical either way; what differs is whether the
module resolves at all. `node:crypto`'s _specifier_ is a Node builtin, so a
Worker needs a compatibility date of `2026-08-04` or later, or an explicit
`nodejs_compat` flag, before it loads. `globalThis.crypto.randomUUID` is a Web
Crypto method, natively implemented in the Workers runtime and in Node 19+, and
needs neither.

This mattered because a repo that adopted `@rexezuge/identity` inherited a
`nodejs_compat` requirement without being told. That failure is invisible at
build time: the bundle compiles, the worker deploys, and the import only
resolves — or does not — when an account is created. Two of the family repos
are configured with `compatibility_flags: []`, so the requirement was being met
by nothing but luck.

Adopting this package should not change a repo's wrangler configuration. Now it
does not.
