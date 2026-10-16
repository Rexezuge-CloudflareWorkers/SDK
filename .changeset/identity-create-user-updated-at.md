---
'@rexezuge/identity': patch
---

FIX(identity): Stamp `updated_at` When `createUser` Creates An Account

`UserDAO#createUser` inserted `(email, created_at, id, current_email)` and left
`updated_at` unwritten. On the canonical schema the column is nullable, so
nothing failed there — but a consumer whose `users.updated_at` is `NOT NULL`
cannot relax that through `ALTER`, and D1's enforced foreign keys forbid the
table rebuild that could, so the INSERT failed outright and the identity
package was unusable on that schema. That is not hypothetical: Mail-Otter and
CalDAV-Bridge both carry `updated_at INTEGER NOT NULL`, and Mail-Otter keeps a
local `createUser` override whose INSERT writes the column.

A created account is a touched account. The row is now stamped
`updated_at = now` beside `created_at`, so there is no window in which it
exists with no update timestamp — and a consumer's retention sweep cannot
mistake a fresh account for an idle one.
